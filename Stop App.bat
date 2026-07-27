@echo off
REM Double-click to force-stop CrewOps and any leftover background processes.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-app.ps1"
timeout /t 2 /nobreak >nul
