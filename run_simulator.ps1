# Runs the Monte Carlo tournament simulator and writes results to the DB.
# Default: 100,000 simulations. Pass --n 10000 for a quick test run.
# Results appear immediately on the /bracket page.

param(
    [int]$N = 100000
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
$env:PATH = "C:\Program Files\Go\bin;$env:PATH"

Write-Host "Running simulator ($N simulations) ..." -ForegroundColor Cyan
Set-Location "$root\go\simulator"
go run ./cmd/simulator --n $N
