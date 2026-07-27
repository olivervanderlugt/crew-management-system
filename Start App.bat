@echo off
REM Double-click to start CrewOps. Closing the window stops the server.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-app.ps1"
