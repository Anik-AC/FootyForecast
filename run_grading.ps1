# Grades all completed WC 2026 matches that don't yet have a grading row.
# Computes log loss and Brier score for the model and any available market snapshots.
# Safe to re-run: uses ON CONFLICT DO NOTHING, so already-graded matches are skipped.
#
# Run after each confirmed match result.

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

Write-Host "Running grading job ..." -ForegroundColor Cyan
Set-Location "$root\python"
uv run python -m footy.grading
