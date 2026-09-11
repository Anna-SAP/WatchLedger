@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Launcher.ps1" %*
pause
