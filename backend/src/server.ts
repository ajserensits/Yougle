import "dotenv/config";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { createLinkSchema, createEntitySchema, createWebLinkSchema, updateEntitySchema } from "./schema.js";
import { addWebLink, db, findEntity, findUser, linksForEntity, LOCAL_USER_ID, replaceTags, replaceWebLinks, searchEntities, webLinksForEntity } from "./database.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const logHttpBodies = process.env.LOG_HTTP_BODIES === "true";
const sensitiveLogKey = /authorization|cookie|token|secret|password|api[-_]?key/i;

function safeForLog(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 2_000 ? `${value.slice(0, 2_000)}… [truncated]` : value;
  if (Buffer.isBuffer(value)) return `[binary payload: ${value.length} bytes]`;
  if (depth >= 5) return "[maximum log depth reached]";
  if (Array.isArray(value)) {
    const items = value.slice(0, 50).map((item) => safeForLog(item, depth + 1));
    if (value.length > 50) items.push(`[${value.length - 50} more items]`);
    return items;
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).slice(0, 100).map(([key, item]) => [
        key,
        sensitiveLogKey.test(key) ? "[REDACTED]" : safeForLog(item, depth + 1)
      ])
    );
  }
  return String(value);
}

function safeHeadersForLog(headers: Request["headers"]): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      sensitiveLogKey.test(key) ? "[REDACTED]" : safeForLog(value)
    ])
  );
}

app.use((request, response, next) => {
  const startedAt = performance.now();
  let responseBody: unknown;
  const originalJson = response.json.bind(response);
  const originalSend = response.send.bind(response);
  response.json = ((body?: unknown) => {
    responseBody = body;
    return originalJson(body);
  }) as Response["json"];
  response.send = ((body?: unknown) => {
    if (responseBody === undefined) responseBody = body;
    return originalSend(body);
  }) as Response["send"];

  console.log(JSON.stringify({
    type: "http_request",
    method: request.method,
    endpoint: request.path,
    query: safeForLog(request.query),
    headers: safeHeadersForLog(request.headers),
    ...(logHttpBodies ? { body: safeForLog(request.body) } : {})
  }));

  response.on("finish", () => {
    console.log(JSON.stringify({
      type: "http_response",
      method: request.method,
      endpoint: request.path,
      statusCode: response.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
      ...(logHttpBodies ? { body: safeForLog(responseBody) } : {})
    }));
  });
  next();
});

const defaultUserId = process.env.DEFAULT_USER_ID ?? LOCAL_USER_ID;

function userIdFor(request: Request, response: Response): string | undefined {
  const requestedUserId = (request.header("x-yougle-user-id") ?? defaultUserId).toLowerCase();
  if (!findUser(requestedUserId)) {
    response.status(401).json({ error: "Unknown Yougle user" });
    return undefined;
  }
  return requestedUserId;
}

app.get("/health", (_request, response) => {
  db.prepare("SELECT 1").get();
  response.json({ status: "ok" });
});

app.get("/api/entities", (request, response) => {
  const ownerUserId = userIdFor(request, response);
  if (!ownerUserId) return;
  const query = {
    ownerUserId,
    q: typeof request.query.q === "string" ? request.query.q : undefined,
    kind: typeof request.query.kind === "string" ? request.query.kind : undefined,
    tag: typeof request.query.tag === "string" ? request.query.tag : undefined
  };
  response.json({ entities: searchEntities(query) });
});

app.get("/api/entities/:id", (request, response) => {
  const ownerUserId = userIdFor(request, response);
  if (!ownerUserId) return;
  const id = request.params.id.toLowerCase();
  const entity = findEntity(id, ownerUserId);
  if (!entity) return response.status(404).json({ error: "Entity not found" });
  const links = linksForEntity(id, ownerUserId);
  const relatedEntities = links.flatMap((link) => {
    const relatedId = link.sourceEntityId === id ? link.targetEntityId : link.sourceEntityId;
    const related = findEntity(relatedId, ownerUserId);
    return related ? [related] : [];
  });
  return response.json({
    entity,
    links,
    relatedEntities,
    webLinks: webLinksForEntity(id, ownerUserId)
  });
});

app.post("/api/entities", (request, response) => {
  const ownerUserId = userIdFor(request, response);
  if (!ownerUserId) return;
  const input = createEntitySchema.parse(request.body);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO entities (id, owner_user_id, kind, name, description, occurred_at, attributes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, ownerUserId, input.kind, input.name, input.description, input.occurredAt ?? null, JSON.stringify(input.attributes), now, now);
  replaceTags(id, input.tags);
  for (const webLink of input.webLinks) addWebLink(id, webLink, now);

  return response.status(201).json({ entity: findEntity(id, ownerUserId) });
});

app.post("/api/entities/:id/web-links", (request, response) => {
  const ownerUserId = userIdFor(request, response);
  if (!ownerUserId) return;
  const entityId = request.params.id.toLowerCase();
  if (!findEntity(entityId, ownerUserId)) return response.status(404).json({ error: "Entity not found" });

  const input = createWebLinkSchema.parse(request.body);
  return response.status(201).json({ webLink: addWebLink(entityId, input) });
});

app.delete("/api/entities/:id/web-links/:webLinkId", (request, response) => {
  const ownerUserId = userIdFor(request, response);
  if (!ownerUserId) return;
  const entityId = request.params.id.toLowerCase();
  const webLinkId = request.params.webLinkId.toLowerCase();
  if (!findEntity(entityId, ownerUserId)) return response.status(404).json({ error: "Entity not found" });

  const result = db.prepare("DELETE FROM entity_web_links WHERE id = ? AND entity_id = ?").run(webLinkId, entityId);
  if (!result.changes) return response.status(404).json({ error: "Web link not found" });
  return response.status(204).send();
});

app.patch("/api/entities/:id", (request, response) => {
  const ownerUserId = userIdFor(request, response);
  if (!ownerUserId) return;
  const id = request.params.id.toLowerCase();
  const existing = findEntity(id, ownerUserId);
  if (!existing) return response.status(404).json({ error: "Entity not found" });

  const input = updateEntitySchema.parse(request.body);
  const next = { ...existing, ...input, updatedAt: new Date().toISOString() };
  db.prepare(`
    UPDATE entities
    SET kind = ?, name = ?, description = ?, occurred_at = ?, attributes = ?, updated_at = ?
    WHERE id = ? AND owner_user_id = ?
  `).run(next.kind, next.name, next.description, next.occurredAt, JSON.stringify(next.attributes), next.updatedAt, id, ownerUserId);
  if (input.tags) replaceTags(id, input.tags);
  if (input.webLinks) replaceWebLinks(id, input.webLinks);

  return response.json({ entity: findEntity(id, ownerUserId) });
});

app.delete("/api/entities/:id", (request, response) => {
  const ownerUserId = userIdFor(request, response);
  if (!ownerUserId) return;
  const id = request.params.id.toLowerCase();
  const result = db.prepare("DELETE FROM entities WHERE id = ? AND owner_user_id = ?").run(id, ownerUserId);
  if (!result.changes) return response.status(404).json({ error: "Entity not found" });
  return response.status(204).send();
});

app.post("/api/entities/:id/links", (request, response) => {
  const ownerUserId = userIdFor(request, response);
  if (!ownerUserId) return;
  const sourceEntityId = request.params.id.toLowerCase();
  const sourceEntity = findEntity(sourceEntityId, ownerUserId);
  if (!sourceEntity) return response.status(404).json({ error: "Source entity not found" });

  const input = createLinkSchema.parse(request.body);
  const targetEntity = findEntity(input.targetEntityId, ownerUserId);
  if (!targetEntity) return response.status(404).json({ error: "Target entity not found" });
  if (sourceEntityId === input.targetEntityId) return response.status(400).json({ error: "An entity cannot link to itself" });

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO entity_links (id, source_entity_id, target_entity_id, relationship, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, sourceEntity.id, targetEntity.id, input.relationship, createdAt);

  return response.status(201).json({
    link: { id, sourceEntityId: sourceEntity.id, targetEntityId: targetEntity.id, relationship: input.relationship, createdAt }
  });
});

app.delete("/api/entities/:id/links/:linkId", (request, response) => {
  const ownerUserId = userIdFor(request, response);
  if (!ownerUserId) return;
  const entityId = request.params.id.toLowerCase();
  const linkId = request.params.linkId.toLowerCase();
  if (!findEntity(entityId, ownerUserId)) return response.status(404).json({ error: "Entity not found" });

  const result = db.prepare(`
    DELETE FROM entity_links
    WHERE id = ? AND (source_entity_id = ? OR target_entity_id = ?)
  `).run(linkId, entityId, entityId);
  if (!result.changes) return response.status(404).json({ error: "Connection not found" });
  return response.status(204).send();
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    return response.status(400).json({ error: "Invalid request", issues: error.issues });
  }
  console.error(error);
  return response.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const server = app.listen(port, host, () => {
  console.log(`Yougle API listening at http://${host}:${port}`);
});

server.on("error", (error) => {
  console.error("Yougle API failed to start", error);
  process.exit(1);
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}; shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

