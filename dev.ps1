# Starts the Go API and Next.js frontend in two separate PowerShell windows.
# Run this once to bring up the full local dev stack.

$root = $PSScriptRoot

Start-Process powershell -ArgumentList `
    "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$root\run_api.ps1`""

Start-Sleep -Seconds 2   # give the API a moment to connect before the browser opens

Start-Process powershell -ArgumentList `
    "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$root\run_web.ps1`""

Write-Host ""
Write-Host "  API  -> http://localhost:8080/health" -ForegroundColor Cyan
Write-Host "  Web  -> http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Close the two new windows to stop the servers." -ForegroundColor DarkGray
