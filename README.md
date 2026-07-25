# TaskForge

A lightweight project management system inspired by Jira.

## Technology Stack

- ASP.NET Core
- React
- TypeScript
- PostgreSQL

## Goals

- Kanban boards
- Projects
- Tasks
- Comments
- Labels
- Dashboard
- Reporting
- AI assistant

## Local development database

TaskForge expects PostgreSQL at `127.0.0.1:5432`. Create the local `taskforge` role, database, and schema with:

```powershell
.\scripts\setup_local_postgres.ps1
```

See [database/README.md](database/README.md) for custom ports and credentials.
