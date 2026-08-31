@echo off
setlocal
title 停止书签页工具
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":4173" ^| findstr "LISTENING"') do (
  taskkill /PID %%p /F
)
echo Bookmark Masonry stopped on port 4173.
pause
