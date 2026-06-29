param(
    [string]$ComposeFile = "docker/docker-compose.postgres.yml"
)

Write-Host "Applying SQL migrations to Postgres (via Docker Compose)..."

# Ensure the compose service is running
docker compose -f $ComposeFile up -d

$migs = Get-ChildItem -Path "database/migrations" -Filter "*.sql" | Sort-Object Name
foreach ($m in $migs) {
    Write-Host "Applying $($m.Name)..."
    docker compose -f $ComposeFile exec -T db psql -U taskforge -d taskforge -f "/migrations/$($m.Name)"
}

Write-Host "Migrations applied."
