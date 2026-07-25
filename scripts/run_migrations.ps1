param(
    [string]$Server = "127.0.0.1",
    [int]$Port = 5432,
    [string]$Database = "taskforge",
    [string]$User = "taskforge",
    [string]$Password = $env:TASKFORGE_DB_PASSWORD,
    [string]$PsqlPath
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $PsqlPath) {
    $command = Get-Command psql -ErrorAction SilentlyContinue
    if ($command) {
        $PsqlPath = $command.Source
    } else {
        $PsqlPath = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
            Sort-Object { [version]$_.VersionInfo.FileVersion } -Descending |
            Select-Object -First 1 -ExpandProperty FullName
    }
}

if (-not $PsqlPath -or -not (Test-Path $PsqlPath)) {
    throw "psql was not found. Install PostgreSQL or pass -PsqlPath explicitly."
}

$migrations = Get-ChildItem (Join-Path $repoRoot "database/migrations") -Filter "*.sql" |
    Sort-Object Name

if (-not $migrations) {
    throw "No SQL migrations were found."
}

$previousPassword = $env:PGPASSWORD
try {
    if ($Password) {
        $env:PGPASSWORD = $Password
    }

    foreach ($migration in $migrations) {
        Write-Host "Applying $($migration.Name)..."
        & $PsqlPath -X -v ON_ERROR_STOP=1 -h $Server -p $Port -U $User -d $Database -f $migration.FullName
        if ($LASTEXITCODE -ne 0) {
            throw "Migration $($migration.Name) failed with exit code $LASTEXITCODE."
        }
    }
} finally {
    $env:PGPASSWORD = $previousPassword
}

Write-Host "Migrations applied to postgresql://${Server}:${Port}/${Database}."
