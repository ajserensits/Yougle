import { z } from "zod";

const trimmedText = z.string().trim();

const httpUrl = trimmedText.max(2_048).refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}, "URL must use http:// or https://");

export const webLinkSchema = z.object({
  label: trimmedText.max(200).default(""),
  url: httpUrl
});

export const createEntitySchema = z.object({
  kind: trimmedText.min(1).max(80),
  name: trimmedText.min(1).max(200),
  description: trimmedText.max(20_000).default(""),
  occurredAt: z.string().datetime({ offset: true }).nullable().optional(),
  tags: z.array(trimmedText.min(1).max(80)).max(50).default([]),
  attributes: z.record(trimmedText.min(1).max(100), trimmedText.max(5_000)).default({}),
  webLinks: z.array(webLinkSchema).max(50).default([])
});

export const updateEntitySchema = createEntitySchema.partial();

export const createLinkSchema = z.object({
  targetEntityId: z.string().uuid().transform((value) => value.toLowerCase()),
  relationship: trimmedText.min(1).max(120)
});

export const createWebLinkSchema = webLinkSchema;

