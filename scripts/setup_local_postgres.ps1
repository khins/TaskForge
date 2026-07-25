param(
    [string]$Server = "127.0.0.1",
    [int]$Port = 5432,
    [string]$AdminUser = "postgres",
    [string]$AppUser = "taskforge",
    [string]$Database = "taskforge",
    [string]$AppPassword = "taskforge",
    [securestring]$AdminPassword,
    [string]$PsqlPath
)

$ErrorActionPreference = "Stop"

foreach ($identifier in @($AdminUser, $AppUser, $Database)) {
    if ($identifier -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
        throw "PostgreSQL identifiers may only contain letters, numbers, and underscores: $identifier"
    }
}

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

$escapedPassword = $AppPassword.Replace("'", "''")
$bootstrapSql = @"
SELECT format('CREATE ROLE %I LOGIN', '$AppUser')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$AppUser') \gexec
ALTER ROLE "$AppUser" WITH LOGIN PASSWORD '$escapedPassword';
SELECT format('CREATE DATABASE %I OWNER %I', '$Database', '$AppUser')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$Database') \gexec
ALTER DATABASE "$Database" OWNER TO "$AppUser";
"@

if (-not $AdminPassword) {
    $AdminPassword = Read-Host "PostgreSQL password for administrator '$AdminUser' on ${Server}:${Port}" -AsSecureString
}

$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($AdminPassword)
$previousPassword = $env:PGPASSWORD
try {
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    Write-Host "Creating local role and database on PostgreSQL at ${Server}:${Port}..."
    $bootstrapSql | & $PsqlPath -X -w -v ON_ERROR_STOP=1 -h $Server -p $Port -U $AdminUser -d postgres
    if ($LASTEXITCODE -ne 0) {
        throw "Local PostgreSQL bootstrap failed with exit code $LASTEXITCODE. Check the server port and administrator password."
    }
} finally {
    $env:PGPASSWORD = $previousPassword
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}

& (Join-Path $PSScriptRoot "run_migrations.ps1") `
    -Server $Server `
    -Port $Port `
    -Database $Database `
    -User $AppUser `
    -Password $AppPassword `
    -PsqlPath $PsqlPath

Write-Host "Local TaskForge database is ready."
