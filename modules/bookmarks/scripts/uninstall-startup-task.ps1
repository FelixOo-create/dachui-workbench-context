$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$taskName = "BookmarkMasonryTool"
$startupShortcutPath = Join-Path ([Environment]::GetFolderPath("Startup")) "$taskName.lnk"

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Removed startup task: $taskName"
} else {
  Write-Host "Startup task was not installed: $taskName"
}

if (Test-Path -LiteralPath $startupShortcutPath) {
  Remove-Item -LiteralPath $startupShortcutPath -Force
  Write-Host "Removed startup shortcut: $startupShortcutPath"
} else {
  Write-Host "Startup shortcut was not installed: $startupShortcutPath"
}
