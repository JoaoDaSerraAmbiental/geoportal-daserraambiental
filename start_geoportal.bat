@echo off
title Geoportal - Da Serra Ambiental
echo ==========================================================
echo       Iniciando Geoportal - Da Serra Ambiental...
echo ==========================================================
echo.
cd /d "%~dp0"

REM Testa se o Python realmente funciona (ignora alias da Microsoft Store)
py -c "print('ok')" >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Python encontrado. Iniciando servidor Python...
    py server.py
    goto :end
)

python -c "print('ok')" >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Python encontrado. Iniciando servidor Python...
    python server.py
    goto :end
)

REM Sem Python — usa PowerShell (funciona em qualquer Windows)
echo [!] Python nao encontrado. Usando servidor PowerShell...
echo.
start http://localhost:8080/index.html
powershell -ExecutionPolicy Bypass -File "%~dp0servidor_ps.ps1"

:end
pause
