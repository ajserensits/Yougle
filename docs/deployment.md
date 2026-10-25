# Linux VPS deployment

## Recommended first deployment

The current architecture is appropriate for one VPS and one API process:

- Docker Compose manages the API process.
- SQLite lives in a named Docker volume and survives container replacement.
- The container runs as an unprivileged user.
- The service has a health check and restarts automatically.
- Port 3000 binds only to `127.0.0.1` on the VPS.

SQLite is deliberately the first database because it keeps operations simple. Move to PostgreSQL when Yougle needs multiple API replicas, sustained concurrent writes, or managed database failover.

## Prerequisites

- A supported Linux VPS
- Docker Engine with the Compose plugin
- SSH access using keys
- A firewall allowing SSH, and later HTTPS, only

## Start the private API

Clone the repository on the VPS, then run:

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3000/health
```

The default configuration is intentionally reachable only from the VPS itself. During early development, use an SSH tunnel or a private network such as Tailscale rather than publishing the unauthenticated API.

The development client sends a temporary `X-Yougle-User-ID` header. This selects the owner used to scope database operations, but it is not authentication because a caller can forge the header. Replace it with a verified account session before public access.

Development environments can set `LOG_HTTP_BODIES=true` to log request and response bodies. Authorization, cookies, passwords, tokens, secrets, and API keys are redacted automatically, and large values are truncated. Keep this disabled in production because entity content may contain private or medical information.

## Public access checklist

Do not place the current API on the public internet yet. Before public access:

1. Add account authentication.
2. Scope every entity, link, search, and attachment query to its owner or shared space.
3. Put the service behind a TLS reverse proxy such as Caddy or nginx.
4. Set explicit request and media upload size limits.
5. Store secrets outside the repository.
6. Enable automatic OS security updates and a restrictive firewall.
7. Test restore procedures, not just backup creation.

Once authentication is present, a reverse proxy can forward HTTPS traffic to `127.0.0.1:3000` without changing the Compose port binding.

## Backups

SQLite uses write-ahead logging, so do not copy the live database file with a plain filesystem copy. Use SQLite's backup command from inside the running container, then send the resulting backup off the VPS.

Example manual snapshot:

```bash
docker compose exec api node -e "const Database=require('better-sqlite3'); const db=new Database('/app/data/yougle.sqlite'); db.backup('/app/data/yougle-backup.sqlite').then(()=>db.close())"
```

Copy `yougle-backup.sqlite` to encrypted off-site storage and rotate snapshots. Automating this safely is a follow-up deployment task.

## Updating

```bash
git pull --ff-only
docker compose up -d --build
docker image prune -f
```

Review schema migrations and take a verified backup before deploying any database change.

