@echo off
powershell.exe -NoProfile -File "%~dp0scripts\Start-Qwen.ps1"
if errorlevel 1 (
  pause
  exit /b 1
)
start "" "http://127.0.0.1:5173/"
