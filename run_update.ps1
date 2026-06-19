# run_update.ps1 — manual post-match update pipeline
#
# The scheduler (python -m footy.scheduler) runs this pipeline automatically
# after every match. Use this script only when you need to trigger an
# immediate update outside the scheduler's polling cycle.
#
# Steps:
#   1. Ingest latest results from football-data.org
#   2. Update Elo ratings
#   3. Regenerate match predictions
#   4. Grade completed predictions
#   5. Re-run Monte Carlo bracket simulator
#   6. Refresh goal scorer stats
#   7. Re-generate player anytime-scorer predictions
#   8. Refresh trivia for upcoming fixtures
#   9. Refresh LLM previews for upcoming fixtures
#
# Usage:
#   .\run_update.ps1

$root = $PSScriptRoot
$envFile = "$root\python\.env"

# --- Load env vars from python/.env ---
function Get-EnvValue($key) {
    $line = Get-Content $envFile | Where-Object { $_ -match "^$key=" } | Select-Object -First 1
    if ($line) { return ($line -split "=", 2)[1] }
    return $null
}

$dbUrl = Get-EnvValue "DATABASE_URL"
if (-not $dbUrl) {
    Write-Host "ERROR: DATABASE_URL not set in $envFile" -ForegroundColor Red
    exit 1
}
$env:DATABASE_URL = $dbUrl

$footballDataKey = Get-EnvValue "FOOTBALLDATA_KEY"
if ($footballDataKey) { $env:FOOTBALLDATA_KEY = $footballDataKey }

$openrouterKey = Get-EnvValue "OPENROUTER_API_KEY"
if ($openrouterKey) { $env:OPENROUTER_API_KEY = $openrouterKey }

Set-Location "$root\python"

# -------------------------------------------------------------------
# Step 1: Ingest latest results
# -------------------------------------------------------------------
Write-Host ""
Write-Host "=== [1/9] Ingest latest WC 2026 results ===" -ForegroundColor Cyan
if (-not $footballDataKey -or $footballDataKey -eq "your_footballdata_key_here") {
    Write-Host "  FOOTBALLDATA_KEY not set — skipping ingest." -ForegroundColor Yellow
    Write-Host "  (Set it in python/.env to enable automatic result fetching.)"
} else {
    # Delete the fixture cache so we always get fresh data
    $cacheFile = "$root\python\data\wc2026_fixtures_cache.json"
    if (Test-Path $cacheFile) { Remove-Item $cacheFile -Force }
    $r1 = cmd /c "uv run python -m footy.ingest.wc2026 2>&1"
    $r1 | ForEach-Object { Write-Host "  $_" }
}

# -------------------------------------------------------------------
# Step 2: Update Elo ratings
# -------------------------------------------------------------------
Write-Host ""
Write-Host "=== [2/9] Update Elo ratings ===" -ForegroundColor Cyan
$r2 = cmd /c "uv run python -m footy.ratings.elo 2>&1"
$r2 | ForEach-Object { Write-Host "  $_" }

# -------------------------------------------------------------------
# Step 3: Regenerate match predictions
# -------------------------------------------------------------------
Write-Host ""
Write-Host "=== [3/9] Regenerate match predictions ===" -ForegroundColor Cyan
$r3 = cmd /c "uv run python -m footy.models.predict 2>&1"
$r3 | ForEach-Object { Write-Host "  $_" }

# -------------------------------------------------------------------
# Step 4: Grade completed matches
# -------------------------------------------------------------------
Write-Host ""
Write-Host "=== [4/9] Grade completed match predictions ===" -ForegroundColor Cyan
$r4 = cmd /c "uv run python -m footy.grading 2>&1"
$r4 | ForEach-Object { Write-Host "  $_" }

# -------------------------------------------------------------------
# Step 5: Re-run Monte Carlo simulator
# -------------------------------------------------------------------
Write-Host ""
Write-Host "=== [5/9] Re-run Monte Carlo bracket simulator ===" -ForegroundColor Cyan
Set-Location "$root\go\simulator"
$r5 = cmd /c "go run ./cmd/simulator --n 100000 2>&1"
$r5 | ForEach-Object { Write-Host "  $_" }
Set-Location "$root\python"

# -------------------------------------------------------------------
# Step 6: Refresh goal scorer stats
# -------------------------------------------------------------------
Write-Host ""
Write-Host "=== [6/9] Refresh WC 2026 goal scorer stats ===" -ForegroundColor Cyan
if (-not $footballDataKey -or $footballDataKey -eq "your_footballdata_key_here") {
    Write-Host "  FOOTBALLDATA_KEY not set — skipping scorer ingestion." -ForegroundColor Yellow
} else {
    $r6 = cmd /c "uv run python -m footy.ingest.scorers 2>&1"
    $r6 | ForEach-Object { Write-Host "  $_" }
}

# -------------------------------------------------------------------
# Step 7: Re-generate player predictions
# -------------------------------------------------------------------
Write-Host ""
Write-Host "=== [7/9] Re-generate player scorer predictions ===" -ForegroundColor Cyan
$r7 = cmd /c "uv run python -m footy.player_predictions 2>&1"
$r7 | ForEach-Object { Write-Host "  $_" }

# -------------------------------------------------------------------
# Step 8: Refresh trivia for upcoming fixtures
# -------------------------------------------------------------------
Write-Host ""
Write-Host "=== [8/9] Refresh trivia for upcoming fixtures ===" -ForegroundColor Cyan
$r8 = cmd /c "uv run python -m footy.trivia 2>&1"
$r8 | ForEach-Object { Write-Host "  $_" }

# -------------------------------------------------------------------
# Step 9: Refresh LLM previews for upcoming fixtures
# -------------------------------------------------------------------
Write-Host ""
Write-Host "=== [9/9] Refresh LLM previews ===" -ForegroundColor Cyan
if (-not $openrouterKey -or $openrouterKey -eq "your_openrouter_api_key_here") {
    Write-Host "  OPENROUTER_API_KEY not set — skipping previews." -ForegroundColor Yellow
    Write-Host "  (Set it in python/.env; free key available at https://openrouter.ai)"
} else {
    $r9 = cmd /c "uv run python -m footy.previews 2>&1"
    $r9 | ForEach-Object { Write-Host "  $_" }
}

Write-Host ""
Write-Host "Manual update complete." -ForegroundColor Green
