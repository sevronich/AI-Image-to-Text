@echo off
set "CHITRA_PROJECT=%~dp0"
if exist "%CHITRA_PROJECT%scripts\Start-Qwen.ps1" goto launch
set "CHITRA_PROJECT=D:\Project\Chitra-AI\"
if exist "%CHITRA_PROJECT%scripts\Start-Qwen.ps1" goto launch
echo Chitra AI was not found. Open START.cmd in the installed project folder.
pause
exit /b 1
:launch
powershell.exe -NoProfile -File "%CHITRA_PROJECT%scripts\Start-Qwen.ps1"
if errorlevel 1 (
  pause
  exit /b 1
)
start "" "http://127.0.0.1:5173/"
