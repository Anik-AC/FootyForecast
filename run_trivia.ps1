# Generates pre-match trivia facts from historical_matches for upcoming WC 2026 fixtures
# and writes them to the match_trivia table.
#
# Pass specific fixture IDs to re-generate for those matches only.
#
# Usage:
#   .\run_trivia.ps1
#   .\run_trivia.ps1 WC2026-GRP-A-01 WC2026-GRP-A-02

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

Write-Host "Generating trivia facts ..." -ForegroundColor Cyan
Set-Location "$root\python"

if ($FixtureId) {
    uv run python -m footy.trivia @FixtureId
} else {
    uv run python -m footy.trivia
}
