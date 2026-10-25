import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Entity, EntityLink, EntityWebLink, User } from "./types.js";

export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";

type EntityRow = {
  id: string;
  owner_user_id: string;
  kind: string;
  name: string;
  description: string;
  occurred_at: string | null;
  attributes: string;
  created_at: string;
  updated_at: string;
};

const databasePath = resolve(process.env.DATABASE_PATH ?? "./data/yougle.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    email TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  INSERT OR IGNORE INTO users (id, display_name, email, created_at, updated_at)
  VALUES (
    '${LOCAL_USER_ID}',
    'Local User',
    NULL,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );

  CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    occurred_at TEXT,
    attributes TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE
  );

  CREATE TABLE IF NOT EXISTS entity_tags (
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (entity_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS entity_links (
    id TEXT PRIMARY KEY,
    source_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    target_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL,
    created_at TEXT NOT NULL,
    CHECK (source_entity_id <> target_entity_id)
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    original_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS entity_web_links (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    created_at TEXT NOT NULL,
    CHECK (url LIKE 'http://%' OR url LIKE 'https://%')
  );

`);

// Backfill databases created before per-user ownership was introduced.
const entityColumns = db.pragma("table_info(entities)") as Array<{ name: string }>;
if (!entityColumns.some((column) => column.name === "owner_user_id")) {
  db.exec(`
    ALTER TABLE entities ADD COLUMN owner_user_id TEXT REFERENCES users(id);
    UPDATE entities SET owner_user_id = '${LOCAL_USER_ID}' WHERE owner_user_id IS NULL;
  `);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_entities_owner ON entities(owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_entities_owner_kind ON entities(owner_user_id, kind);
  CREATE INDEX IF NOT EXISTS idx_entity_links_source ON entity_links(source_entity_id);
  CREATE INDEX IF NOT EXISTS idx_entity_links_target ON entity_links(target_entity_id);
  CREATE INDEX IF NOT EXISTS idx_entity_web_links_entity ON entity_web_links(entity_id);
`);

const tagsForEntity = db.prepare(`
  SELECT t.name
  FROM tags t
  JOIN entity_tags et ON et.tag_id = t.id
  WHERE et.entity_id = ?
  ORDER BY t.name COLLATE NOCASE
`);

function mapEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    occurredAt: row.occurred_at,
    attributes: JSON.parse(row.attributes) as Record<string, string>,
    tags: (tagsForEntity.all(row.id) as Array<{ name: string }>).map((tag) => tag.name),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function findUser(id: string): User | undefined {
  const row = db.prepare(`
    SELECT id, display_name, email, created_at, updated_at
    FROM users
    WHERE id = ?
  `).get(id.toLowerCase()) as {
    id: string;
    display_name: string;
    email: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;

  return row ? {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  } : undefined;
}

export function findEntity(id: string, ownerUserId: string): Entity | undefined {
  const row = db.prepare("SELECT * FROM entities WHERE id = ? AND owner_user_id = ?")
    .get(id.toLowerCase(), ownerUserId.toLowerCase()) as EntityRow | undefined;
  return row ? mapEntity(row) : undefined;
}

export function searchEntities(options: { ownerUserId: string; q?: string; kind?: string; tag?: string }): Entity[] {
  const clauses: string[] = ["e.owner_user_id = ?"];
  const parameters: string[] = [options.ownerUserId];

  if (options.kind) {
    clauses.push("lower(e.kind) = lower(?)");
    parameters.push(options.kind);
  }
  if (options.tag) {
    clauses.push(`EXISTS (
      SELECT 1 FROM entity_tags filter_et
      JOIN tags filter_t ON filter_t.id = filter_et.tag_id
      WHERE filter_et.entity_id = e.id AND lower(filter_t.name) = lower(?)
    )`);
    parameters.push(options.tag);
  }
  if (options.q) {
    const tokens = options.q.toLowerCase().trim().split(/\s+/).filter(Boolean).slice(0, 8);
    for (const token of tokens) {
      const variants = new Set([token]);
      if (token.length > 3 && token.endsWith("ies")) variants.add(`${token.slice(0, -3)}y`);
      else if (token.length > 3 && token.endsWith("s")) variants.add(token.slice(0, -1));

      const variantClauses: string[] = [];
      for (const variant of variants) {
        const escaped = variant.replace(/[\\%_]/g, "\\$&");
        const likeQuery = `%${escaped}%`;
        variantClauses.push(`(
          lower(e.name) LIKE ? ESCAPE '\\' OR lower(e.description) LIKE ? ESCAPE '\\'
          OR lower(e.kind) LIKE ? ESCAPE '\\' OR lower(e.attributes) LIKE ? ESCAPE '\\'
          OR EXISTS (
            SELECT 1 FROM entity_tags search_et
            JOIN tags search_t ON search_t.id = search_et.tag_id
            WHERE search_et.entity_id = e.id AND lower(search_t.name) LIKE ? ESCAPE '\\'
          )
          OR EXISTS (
            SELECT 1 FROM entity_links l
            JOIN entities linked ON linked.id = CASE
              WHEN l.source_entity_id = e.id THEN l.target_entity_id
              ELSE l.source_entity_id
            END
            WHERE (l.source_entity_id = e.id OR l.target_entity_id = e.id)
              AND linked.owner_user_id = e.owner_user_id
              AND (lower(linked.name) LIKE ? ESCAPE '\\' OR lower(l.relationship) LIKE ? ESCAPE '\\')
          )
          OR EXISTS (
            SELECT 1 FROM entity_web_links web
            WHERE web.entity_id = e.id
              AND (lower(web.label) LIKE ? ESCAPE '\\' OR lower(web.url) LIKE ? ESCAPE '\\')
          )
        )`);
        parameters.push(...Array(9).fill(likeQuery));
      }
      clauses.push(`(${variantClauses.join(" OR ")})`);
    }
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT DISTINCT e.* FROM entities e
    ${where}
    ORDER BY COALESCE(e.occurred_at, e.updated_at) DESC
    LIMIT 200
  `).all(...parameters) as EntityRow[];

  return rows.map(mapEntity);
}

export function replaceTags(entityId: string, tags: string[]): void {
  entityId = entityId.toLowerCase();
  const normalized = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
  const deleteTags = db.prepare("DELETE FROM entity_tags WHERE entity_id = ?");
  const insertTag = db.prepare("INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)");
  const findTag = db.prepare("SELECT id FROM tags WHERE name = ? COLLATE NOCASE");
  const joinTag = db.prepare("INSERT INTO entity_tags (entity_id, tag_id) VALUES (?, ?)");

  db.transaction(() => {
    deleteTags.run(entityId);
    for (const name of normalized) {
      insertTag.run(crypto.randomUUID(), name);
      const tag = findTag.get(name) as { id: string };
      joinTag.run(entityId, tag.id);
    }
  })();
}

export function linksForEntity(entityId: string, ownerUserId: string): EntityLink[] {
  entityId = entityId.toLowerCase();
  ownerUserId = ownerUserId.toLowerCase();
  const rows = db.prepare(`
    SELECT l.id, l.source_entity_id, l.target_entity_id, l.relationship, l.created_at
    FROM entity_links l
    JOIN entities source ON source.id = l.source_entity_id
    JOIN entities target ON target.id = l.target_entity_id
    WHERE (l.source_entity_id = ? OR l.target_entity_id = ?)
      AND source.owner_user_id = ?
      AND target.owner_user_id = ?
    ORDER BY l.created_at DESC
  `).all(entityId, entityId, ownerUserId, ownerUserId) as Array<{
    id: string;
    source_entity_id: string;
    target_entity_id: string;
    relationship: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    sourceEntityId: row.source_entity_id,
    targetEntityId: row.target_entity_id,
    relationship: row.relationship,
    createdAt: row.created_at
  }));
}

export function webLinksForEntity(entityId: string, ownerUserId: string): EntityWebLink[] {
  entityId = entityId.toLowerCase();
  ownerUserId = ownerUserId.toLowerCase();
  const rows = db.prepare(`
    SELECT web.id, web.entity_id, web.label, web.url, web.created_at
    FROM entity_web_links web
    JOIN entities entity ON entity.id = web.entity_id
    WHERE web.entity_id = ? AND entity.owner_user_id = ?
    ORDER BY web.created_at ASC
  `).all(entityId, ownerUserId) as Array<{
    id: string;
    entity_id: string;
    label: string;
    url: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    entityId: row.entity_id,
    label: row.label,
    url: row.url,
    createdAt: row.created_at
  }));
}

export function addWebLink(
  entityId: string,
  input: { label: string; url: string },
  createdAt = new Date().toISOString()
): EntityWebLink {
  entityId = entityId.toLowerCase();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO entity_web_links (id, entity_id, label, url, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, entityId, input.label, input.url, createdAt);

  return { id, entityId, label: input.label, url: input.url, createdAt };
}

export function replaceWebLinks(
  entityId: string,
  links: Array<{ label: string; url: string }>
): void {
  entityId = entityId.toLowerCase();
  db.transaction(() => {
    db.prepare("DELETE FROM entity_web_links WHERE entity_id = ?").run(entityId);
    for (const link of links) addWebLink(entityId, link);
  })();
}

