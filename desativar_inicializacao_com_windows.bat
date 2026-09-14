@echo off
title Desativar Auto-Sync
echo ==========================================================
echo       Desativando Robo de Sincronizacao Automatica
echo ==========================================================
echo.

set "SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AutoSync_Geoportal_DaSerra.lnk"

if exist "%SHORTCUT%" (
    del /f /q "%SHORTCUT%"
    echo [OK] Atalho removido da pasta de inicializacao do Windows.
) else (
    echo [INFO] O robo nao estava configurado na inicializacao.
)

echo.
echo Encerrando processos do robo em execucao...
powershell -Command "Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*auto_sync.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"

echo.
echo [CONCLUIDO] O robo foi desativado e encerrado.
echo.
pause
