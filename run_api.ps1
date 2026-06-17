# Starts the FootyForecast Go API on http://localhost:8080
# Reads DATABASE_URL from python\.env automatically.

$root = $PSScriptRoot
$envFile = "$root\python\.env"

# Parse DATABASE_URL from the .env file (skips comment lines).
$dbUrl = Get-Content $envFile |
    Where-Object { $_ -match "^DATABASE_URL=" } |
    ForEach-Object { ($_ -split "=", 2)[1] } |
    Select-Object -First 1

if (-not $dbUrl) {
    Write-Host "ERROR: DATABASE_URL not found in $envFile" -ForegroundColor Red
    exit 1
}

$env:DATABASE_URL = $dbUrl
$env:PATH = "C:\Program Files\Go\bin;$env:PATH"

Write-Host "Starting Go API on http://localhost:8080 ..." -ForegroundColor Cyan
Set-Location "$root\go\api"
go run ./cmd/api
