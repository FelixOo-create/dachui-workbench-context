$ErrorActionPreference = "Continue"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
$launcherPath = Join-Path $scriptDir "start-bookmarks-launcher.ps1"
$healthUrl = "http://localhost:4173/api/health"

Set-Location -LiteralPath $projectDir

Write-Host "Starting Bookmark Masonry..."
Write-Host ""

& $launcherPath

try {
  Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5 | Out-Null
  Start-Process "http://localhost:4173"
  Write-Host "Started and opened http://localhost:4173."
  Start-Sleep -Seconds 2
  exit 0
} catch {
  Write-Host ""
  Write-Host "Startup failed: local service did not respond."
  Write-Host "Check data\startup.log and data\server.log."
  Write-Host ""
  Read-Host "Press Enter to close"
  exit 1
}
