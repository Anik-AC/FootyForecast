# Fetches pre-kickoff market snapshots from Polymarket and Kalshi for upcoming
# WC 2026 fixtures and writes them to market_snapshots.
#
# Polymarket: no API key required.
# Kalshi: set KALSHI_API_KEY in python/.env (optional; skipped if absent).
#
# Pass --fixture-id WC2026-GRP-A-01 to limit to one fixture.

param(
    [string[]]$FixtureId
)

$root = $PSScriptRoot
$envFile = "$root\python\.env"

$dbUrl = Get-Content $envFile |
    Where-Object { $_ -match "^DATABASE_URL=" } |
    ForEach-Object { ($_ -split "=", 2)[1] } |
    Select-Object -First 1

if (-not $dbUrl) {
    Write-Host "ERROR: DATABASE_URL not found in $envFile" -ForegroundColor Red
    exit 1
}

$env:DATABASE_URL = $dbUrl

$kalshiKey = Get-Content $envFile |
    Where-Object { $_ -match "^KALSHI_API_KEY=" } |
    ForEach-Object { ($_ -split "=", 2)[1] } |
    Select-Object -First 1

if ($kalshiKey -and $kalshiKey -ne "your_kalshi_api_key_here") {
    $env:KALSHI_API_KEY = $kalshiKey
    Write-Host "Kalshi key loaded." -ForegroundColor DarkGray
} else {
    Write-Host "KALSHI_API_KEY not set — Kalshi will be skipped." -ForegroundColor DarkGray
}

Write-Host "Fetching market snapshots ..." -ForegroundColor Cyan
Set-Location "$root\python"

if ($FixtureId) {
    $ids = $FixtureId -join " "
    uv run python -m footy.ingest.markets --fixture-id $ids
} else {
    uv run python -m footy.ingest.markets
}
