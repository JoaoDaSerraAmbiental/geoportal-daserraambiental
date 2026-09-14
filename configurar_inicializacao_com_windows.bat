@echo off
title Configurar Auto-Sync com Windows
echo ==========================================================
echo    Configurando Robo para Iniciar com o Windows
echo ==========================================================
echo.
cd /d "%~dp0"

set "TARGET_PS1=%~dp0auto_sync.ps1"
set "SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AutoSync_Geoportal_DaSerra.lnk"

powershell -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = 'powershell.exe'; $s.Arguments = '-ExecutionPolicy Bypass -WindowStyle Hidden -File \"\"%TARGET_PS1%\"\"'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Save()"

if exist "%SHORTCUT%" (
    echo [SUCESSO] O robo foi configurado para iniciar automaticamente!
    echo Sempre que este computador for ligado, ele ficara rodando silenciosamente.
    echo.
    echo Iniciando o robo agora...
    start /b powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "%TARGET_PS1%"
) else (
    echo [ERRO] Nao foi possivel criar o atalho de inicializacao.
)

echo.
pause
