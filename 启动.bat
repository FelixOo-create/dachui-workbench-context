@echo off
setlocal

:: Kill old process first to ensure the latest build starts
taskkill /f /im DachuiWorkbench.exe >nul 2>nul

set "ROOT=%~dp0"
set "APP_EXE=%ROOT%release\DachuiWorkbench-win32-x64\DachuiWorkbench.exe"

if exist "%APP_EXE%" (
  start "" "%APP_EXE%"
  exit /b 0
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Install Node.js 20+ or build the release package first.
  exit /b 1
)

cd /d "%ROOT%"
npm start
exit /b %errorlevel%
