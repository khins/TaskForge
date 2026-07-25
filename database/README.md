# PostgreSQL setup

TaskForge uses ordered SQL migrations from `database/migrations`. The default development connection is a local PostgreSQL server at `127.0.0.1:5432`.

## Create the local database

From the repository root, run:

```powershell
.\scripts\setup_local_postgres.ps1
```

The script finds `psql` on `PATH` or beneath `C:\Program Files\PostgreSQL`, prompts for the local `postgres` administrator password, and then:

1. Creates or updates the `taskforge` login with password `taskforge`.
2. Creates the `taskforge` database.
3. Applies every migration in lexical order.

Use parameters if your installation differs:

```powershell
.\scripts\setup_local_postgres.ps1 -Port 5432 -AdminUser postgres -AppPassword "your-development-password"
```

When using a different application password, set `ConnectionStrings__DefaultConnection` rather than committing the password:

```powershell
$env:ConnectionStrings__DefaultConnection = "Host=127.0.0.1;Port=5432;Database=taskforge;Username=taskforge;Password=your-development-password"
dotnet run --project backend/TaskForge.Api
```

## Apply later migrations

```powershell
$env:TASKFORGE_DB_PASSWORD = "taskforge"
.\scripts\run_migrations.ps1
```

Both scripts accept `-Server`, `-Port`, and other connection parameters. The Docker Compose file remains available as an optional alternative, but is not required for local development.
