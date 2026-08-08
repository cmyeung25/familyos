@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-bot-deepseek.ps1"
exit /b %ERRORLEVEL%
