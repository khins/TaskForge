Postgres migrations and usage
=============================

This folder contains SQL migrations for the TaskForge project.

Quick start (using Docker)

1. Start Postgres with Docker Compose:

   docker compose -f docker/docker-compose.postgres.yml up -d

2. Apply migrations (Windows PowerShell):

   .\scripts\run_migrations.ps1

Notes
- Migrations are mounted into the container at `/migrations` by the compose file.
- The `scripts/run_migrations.ps1` script runs each `*.sql` file in lexical order.
- For remote Postgres, use `psql` or your preferred migration tool and apply the files in `database/migrations`.
