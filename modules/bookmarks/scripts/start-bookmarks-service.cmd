@echo off
setlocal
cd /d "%CD%"
set "PROJECT_DIR=%CD%"

set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

if not defined PORT set "PORT=4173"
if not defined BOOKMARK_DATA_DIR set "BOOKMARK_DATA_DIR=%CD%\data"
if not defined BOOKMARK_PREVIEW_DIR set "BOOKMARK_PREVIEW_DIR=%CD%\public\previews"
if not exist "%BOOKMARK_DATA_DIR%" mkdir "%BOOKMARK_DATA_DIR%"
if not exist "%BOOKMARK_PREVIEW_DIR%" mkdir "%BOOKMARK_PREVIEW_DIR%"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  exit /b 0
)

"%NODE_EXE%" server.js
