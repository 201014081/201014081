@echo off
title Instalar Plano Inclinado
echo Creando el acceso directo en el Escritorio...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar_windows.ps1"
echo.
pause
