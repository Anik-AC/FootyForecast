# Generates LLM match previews via OpenRouter (free models available) and writes
# them to the match_previews table. Requires OPENROUTER_API_KEY in python/.env.
# Sign up free at https://openrouter.ai — default model is llama-3.1-8b-instruct:free.
#
# Pass specific fixture IDs to re-generate for those matches only.
#
# Usage:
#   .\run_previews.ps1
#   .\run_previews.ps1 WC2026-GRP-A-01

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

$openrouterKey = Get-Content $envFile |
    Where-Object { $_ -match "^OPENROUTER_API_KEY=" } |
    ForEach-Object { ($_ -split "=", 2)[1] } |
    Select-Object -First 1

if (-not $openrouterKey -or $openrouterKey -eq "your_openrouter_api_key_here") {
    Write-Host "ERROR: OPENROUTER_API_KEY not set in $envFile" -ForegroundColor Red
    Write-Host "Get a free key at https://openrouter.ai" -ForegroundColor Yellow
    exit 1
}

$env:OPENROUTER_API_KEY = $openrouterKey

Write-Host "Generating match previews ..." -ForegroundColor Cyan
Set-Location "$root\python"

if ($FixtureId) {
    uv run python -m footy.previews @FixtureId
} else {
    uv run python -m footy.previews
}
