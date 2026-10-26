$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function New-HexSecret {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}
$utf8 = New-Object Text.UTF8Encoding($false)
if (-not (Test-Path -LiteralPath '.env')) {
    # A cloned folder can share the old named volume; new passwords would not match it.
    & docker info --format '{{.ServerVersion}}' *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop before setup. No secrets were generated.' }
    & docker volume inspect portfolio-tam2k6_mysql_data *> $null
    if ($LASTEXITCODE -eq 0) {
        throw 'Existing MySQL volume found but .env is missing. Restore the original .env from your local backup; do not generate new passwords or delete the volume.'
    }
    $lines = @('WEB_PORT=8080','PMA_PORT=8081','GRAFANA_PORT=3001','PROMETHEUS_PORT=9090','ADMIN_USERNAME=admin')
    foreach ($key in @('MYSQL_ROOT_PASSWORD','APP_DB_PASSWORD','EXPORTER_DB_PASSWORD','ADMIN_INITIAL_PASSWORD','GRAFANA_ADMIN_PASSWORD','SESSION_SECRET')) { $lines += "$key=$(New-HexSecret)" }
    [IO.File]::WriteAllLines((Join-Path $PWD '.env'), $lines, $utf8)
}
$settings = @{}
foreach ($line in [IO.File]::ReadAllLines((Join-Path $PWD '.env'))) {
    if ($line -match '^([A-Z_]+)=(.*)$') { $settings[$matches[1]] = $matches[2] }
}
foreach ($key in @('MYSQL_ROOT_PASSWORD','APP_DB_PASSWORD','EXPORTER_DB_PASSWORD')) {
    if ($settings[$key] -notmatch '^[a-fA-F0-9]{32,}$') { throw "$key must contain at least 32 hex characters" }
}
foreach ($key in @('ADMIN_INITIAL_PASSWORD','GRAFANA_ADMIN_PASSWORD','SESSION_SECRET')) {
    if ($settings[$key].Length -lt 32) { throw "$key must contain at least 32 characters" }
}
New-Item -ItemType Directory -Path secrets -Force | Out-Null
$exporter = "[client]`nuser=exporter`npassword=$($settings.EXPORTER_DB_PASSWORD)`nhost=mysql`nport=3306`n"
[IO.File]::WriteAllText((Join-Path $PWD 'secrets/exporter.cnf'), $exporter, $utf8)
# icacls changes only the DACL, without requiring the audit-security privilege.
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().Name
foreach ($secretFile in @('.env','secrets/exporter.cnf')) {
    & icacls $secretFile /inheritance:r /grant:r "$($owner):(F)" 'SYSTEM:(F)' *> $null
    if ($LASTEXITCODE -ne 0) { throw "Cannot restrict permissions for $secretFile" }
}
Write-Output 'Local secrets are ready. Existing .env was preserved. Start with docker compose up -d --build.'
