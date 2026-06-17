# Starts the FootyForecast Next.js dev server on http://localhost:3000

$root = $PSScriptRoot

Write-Host "Starting Next.js dev server on http://localhost:3000 ..." -ForegroundColor Cyan
Set-Location "$root\web"
npm run dev
