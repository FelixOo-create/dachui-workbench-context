$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$electronDist = Join-Path $projectRoot 'node_modules\electron\dist'
$outputRoot = Join-Path $projectRoot 'release'
$output = Join-Path $outputRoot 'DachuiWorkbench-win32-x64'
$rootPackage = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$zip = Join-Path $outputRoot ("DachuiWorkbench-{0}-win32-x64.zip" -f $rootPackage.version)

# Kill old process to avoid file-lock failures during cleanup
Get-Process DachuiWorkbench -ErrorAction SilentlyContinue | Stop-Process -Force

if (-not (Test-Path -LiteralPath (Join-Path $electronDist 'electron.exe'))) {
    throw 'Electron runtime is missing. Run npm install first.'
}

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
if (Test-Path -LiteralPath $output) {
    $resolved = (Resolve-Path -LiteralPath $output).Path
    $expected = [System.IO.Path]::GetFullPath($output)
    if ($resolved -ne $expected -or -not $resolved.StartsWith([System.IO.Path]::GetFullPath($projectRoot))) {
        throw "Refusing to clean unexpected output path: $resolved"
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $output | Out-Null
Copy-Item -Path (Join-Path $electronDist '*') -Destination $output -Recurse -Force
Rename-Item -LiteralPath (Join-Path $output 'electron.exe') -NewName 'DachuiWorkbench.exe'

$appIcon = Join-Path $projectRoot 'resources\app-icon.ico'
$rcedit = Join-Path $projectRoot 'node_modules\electron-winstaller\vendor\rcedit.exe'
if (-not (Test-Path -LiteralPath $appIcon)) {
    throw "Application icon is missing: $appIcon"
}
if (-not (Test-Path -LiteralPath $rcedit)) {
    throw "rcedit is missing: $rcedit"
}
$rceditTemp = Join-Path ([System.IO.Path]::GetTempPath()) ("dachui-rcedit-" + [guid]::NewGuid().ToString('N'))
$tempExe = Join-Path $rceditTemp 'DachuiWorkbench.exe'
$tempIcon = Join-Path $rceditTemp 'app-icon.ico'
New-Item -ItemType Directory -Path $rceditTemp | Out-Null
try {
    Copy-Item -LiteralPath (Join-Path $output 'DachuiWorkbench.exe') -Destination $tempExe
    Copy-Item -LiteralPath $appIcon -Destination $tempIcon
    & $rcedit $tempExe --set-icon $tempIcon
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to apply application icon (rcedit exit code $LASTEXITCODE)"
    }
    Copy-Item -LiteralPath $tempExe -Destination (Join-Path $output 'DachuiWorkbench.exe') -Force
}
finally {
    Remove-Item -LiteralPath $tempExe -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $tempIcon -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $rceditTemp -Force -ErrorAction SilentlyContinue
}

$resources = Join-Path $output 'resources'
$appDir = Join-Path $resources 'app'
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot '.vite') -Destination (Join-Path $appDir '.vite') -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'data') -Destination (Join-Path $resources 'data') -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'resources\tray.png') -Destination (Join-Path $resources 'tray.png')
foreach ($traySize in 16, 20, 24, 32) {
    $trayFile = "tray-$traySize.png"
    Copy-Item -LiteralPath (Join-Path $projectRoot "resources\$trayFile") -Destination (Join-Path $resources $trayFile)
}

$appPackage = [ordered]@{
    name = $rootPackage.name
    productName = $rootPackage.productName
    version = $rootPackage.version
    main = '.vite/build/main.js'
    private = $true
} | ConvertTo-Json
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $appDir 'package.json'), $appPackage + "`n", $utf8NoBom)

if (Test-Path -LiteralPath $zip) {
    Remove-Item -LiteralPath $zip -Force
}
Compress-Archive -Path (Join-Path $output '*') -DestinationPath $zip -CompressionLevel Fastest

Write-Host "Portable app: $output\DachuiWorkbench.exe"
Write-Host "Archive:      $zip"
