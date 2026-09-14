@echo off
title Auto-Sync Geoportal Da Serra
echo ==========================================================
echo     Iniciando Robo de Sincronizacao Automatica
echo ==========================================================
echo.
cd /d "%~dp0"

REM Inicia minimizado em segundo plano
start /min powershell.exe -ExecutionPolicy Bypass -File "%~dp0auto_sync.ps1"

echo [OK] O robo foi iniciado em segundo plano!
echo Ele monitorara alteracoes do SharePoint e enviara ao GitHub.
echo.
timeout /t 5
