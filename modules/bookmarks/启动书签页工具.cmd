@echo off
setlocal
cd /d "%~dp0"

title Bookmark Masonry
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\manual-start.ps1"

if errorlevel 1 (
  echo.
  echo Startup failed. Send this window text or data\startup.log to Codex.
  pause
  exit /b 1
)
