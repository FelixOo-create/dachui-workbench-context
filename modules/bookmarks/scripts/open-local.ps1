$ErrorActionPreference = "Stop"

$target = $env:BOOKMARK_OPEN_PATH

if ([string]::IsNullOrWhiteSpace($target)) {
  throw "BOOKMARK_OPEN_PATH is empty."
}

if (-not (Test-Path -LiteralPath $target)) {
  throw "Path does not exist: $target"
}

$item = Get-Item -LiteralPath $target
$extension = [System.IO.Path]::GetExtension($item.FullName).ToLowerInvariant()

if ($extension -eq ".lnk") {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($item.FullName)

  if ([string]::IsNullOrWhiteSpace($shortcut.TargetPath)) {
    throw "Shortcut target is empty: $target"
  }
  if (-not (Test-Path -LiteralPath $shortcut.TargetPath)) {
    throw "Shortcut target does not exist: $($shortcut.TargetPath)"
  }

  $startInfo = @{
    FilePath = $shortcut.TargetPath
  }
  if (-not [string]::IsNullOrWhiteSpace($shortcut.Arguments)) {
    $startInfo.ArgumentList = $shortcut.Arguments
  }
  if (-not [string]::IsNullOrWhiteSpace($shortcut.WorkingDirectory)) {
    $startInfo.WorkingDirectory = $shortcut.WorkingDirectory
  }

  Start-Process @startInfo
  exit 0
}

if ($item.PSIsContainer) {
  Invoke-Item -LiteralPath $item.FullName
  exit 0
}

$startFile = $item.FullName
$workingDirectory = Split-Path -Parent $startFile

if ($extension -eq ".bat" -or $extension -eq ".cmd") {
  Start-Process -FilePath $startFile -WorkingDirectory $workingDirectory
  exit 0
}

Start-Process -FilePath $startFile -WorkingDirectory $workingDirectory
