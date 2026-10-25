# Product direction

## Core idea

Yougle is a personal knowledge graph with the ease of a notes app. A restaurant, memory, person, medication, recipe, gift idea, or document is an entity rather than a separate hard-coded feature.

Each entity has:

- a type such as `person`, `restaurant`, `memory`, or `medication`
- a name and free-form description
- an optional relevant date
- configurable tags
- flexible key/value attributes
- photos, videos, or files
- labeled web links
- typed links to other entities
- an owning Yougle user

The initial app uses a built-in local user rather than interactive authentication. User ownership is enforced in the API now so a later Apple identity can attach to the same internal user record.

Examples of links include `Andrew — takes → Lisinopril`, `Dinner at Via Napoli — with → Morgan`, and `Via Napoli — located in → Orlando`.

## Search behavior

A query like “Andrew medications” should match both direct text and graph context. The first version performs text and tag search. A later search-ranking layer will combine:

1. exact name and tag matches
2. entity type and description matches
3. attributes
4. linked entity names and relationship labels
5. optional semantic similarity

Semantic search should supplement predictable filters, not replace them.

## Suggested milestones

1. Core capture and retrieval: entity CRUD, tags, links, dates, and text search
2. Media: photo/video upload, thumbnails, metadata, and secure object storage
3. Accounts and sharing: private spaces, spouse/family access, and permissions
4. Rich search: graph-aware ranking, saved searches, and optional semantic search
5. Quality of life: reminders, location capture, share-sheet intake, and offline sync

## Privacy

Medical details and personal memories make privacy a product requirement. Before any public deployment, add authenticated accounts, encrypted transport, strict authorization on every entity and attachment, backups, and a deletion/export workflow.

