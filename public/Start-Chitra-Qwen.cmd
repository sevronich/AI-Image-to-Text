@echo off
powershell.exe -NoProfile -File "%USERPROFILE%\Documents\Codex\2026-10-25\referenced-chatgpt-conversation-this-is-an\work\chitra-ai\scripts\Start-Qwen.ps1"
if errorlevel 1 (
  pause
  exit /b 1
)
start "" "http://127.0.0.1:5173/"
