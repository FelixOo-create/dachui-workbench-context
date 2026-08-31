$ErrorActionPreference = "Continue"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
$dataDir = Join-Path $projectDir "data"
$logPath = Join-Path $dataDir "startup.log"
$serviceScriptPath = Join-Path $scriptDir "start-bookmarks-service.cmd"
$serverPath = Join-Path $projectDir "server.js"
$healthUrl = "http://localhost:4173/api/health"

function Write-StartupLog {
  param([string]$Message)

  if (-not (Test-Path -LiteralPath $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
  }

  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -LiteralPath $logPath -Encoding UTF8 -Value $line
}

function Test-BookmarkService {
  try {
    Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

Write-StartupLog "Launcher started. Project: $projectDir"

for ($attempt = 1; $attempt -le 30; $attempt++) {
  if ((Test-Path -LiteralPath $serverPath) -and (Test-Path -LiteralPath $serviceScriptPath)) {
    break
  }

  Write-StartupLog "Project files are not ready. Retry $attempt/30."
  Start-Sleep -Seconds 2
}

if (-not (Test-Path -LiteralPath $serverPath)) {
  Write-StartupLog "Failed: server.js was not found."
  exit 1
}

if (Test-BookmarkService) {
  Write-StartupLog "Service is already running."
  exit 0
}

Write-StartupLog "Service is not running. Starting service script."

try {
  Start-Process `
    -FilePath $env:ComSpec `
    -ArgumentList "/c `"$serviceScriptPath`"" `
    -WorkingDirectory $projectDir `
    -WindowStyle Hidden
} catch {
  Write-StartupLog "Failed to start service script: $($_.Exception.Message)"
  exit 1
}

for ($attempt = 1; $attempt -le 30; $attempt++) {
  Start-Sleep -Seconds 2
  if (Test-BookmarkService) {
    Write-StartupLog "Service started successfully after $attempt health check(s)."
    exit 0
  }
}

Write-StartupLog "Failed: service did not respond after startup."
exit 1
