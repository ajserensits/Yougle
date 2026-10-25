# Yougle

Yougle is a private, searchable home for the people, places, memories, medications, ideas, and other details that matter to you. Everything is stored as an entity. Entities can have tags, flexible attributes, attachments, and typed relationships to other entities.

## Repository layout

- `ios/` — native SwiftUI iPhone app
- `backend/` — Node.js and TypeScript API backed by SQLite for local development
- `docs/` — product and architecture notes

## Run the backend

Requirements: Node.js 20 or newer.

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

The API starts at `http://localhost:3000`. Data is stored in `backend/data/yougle.sqlite`.

## Run the iPhone app

The Xcode project is generated from `ios/project.yml` so project settings stay reviewable.

```bash
brew install xcodegen
cd ios
xcodegen generate
open Yougle.xcodeproj
```

Choose an iPhone simulator and run. The app uses `http://localhost:3000` by default, which reaches the Mac from the iOS simulator.

## Current MVP

- Create a flexible entity with a type, name, description, optional date, tags, and custom attributes
- Search entity names, descriptions, types, tags, and custom attributes
- Filter by tag or type through the API
- Link any entity to another entity with a named relationship
- Browse and inspect entities from the iPhone app
- Store and query every entity under a specific Yougle user
- Attach multiple labeled HTTP or HTTPS links to an entity
- Add flexible key/value details from the iPhone app
- Create and browse named connections between entities
- Search multiple words across entity text, tags, details, web links, and connected entities
- Fully edit or delete entities, with cascading cleanup of relationships and dependent records

The first version uses a seeded local development user and does not show a login screen. The API already scopes reads, writes, search, deletion, and links by user so Sign in with Apple can replace the temporary identity later without redesigning entity ownership.

See [docs/product.md](docs/product.md) for the proposed roadmap.

## Deploy to a Linux VPS

The repository includes a production container and Compose configuration. See [docs/deployment.md](docs/deployment.md). The API intentionally binds only to the VPS loopback interface in the default Compose file. Do not expose it publicly until authentication and authorization are implemented.


