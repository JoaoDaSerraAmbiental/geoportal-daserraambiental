@echo off
title Atualizar Site - Da Serra Ambiental
echo ==========================================================
echo     Atualizando o site do Geoportal Da Serra Ambiental
echo ==========================================================
echo.
cd /d "%~dp0"

REM Verifica se o Git esta instalado
where git >nul 2>&1
if not %errorlevel%==0 (
    echo [ERRO] Git nao esta instalado!
    echo.
    echo Baixe e instale em: https://git-scm.com/download/win
    echo Depois execute este arquivo novamente.
    echo.
    pause
    exit /b 1
)

REM Verifica se ja e um repositorio Git
if not exist ".git" (
    echo [!] Pasta ainda nao conectada ao GitHub.
    echo     Abra o GitHub Desktop e clone o repositorio primeiro.
    echo     Depois copie este arquivo para dentro da pasta clonada.
    pause
    exit /b 1
)

REM Compila os arquivos GeoJSON para geojson_data.js
echo Compilando alteracoes dos dados GeoJSON...
powershell -ExecutionPolicy Bypass -File "%~dp0build_data.ps1"

REM Adiciona tudo
echo [1/3] Verificando alteracoes...
git add -A

REM Se houver alteracoes, cria o commit
git diff --cached --quiet
if not %errorlevel%==0 (
    echo [2/3] Salvando alteracoes...
    set TIMESTAMP=%date% %time:~0,5%
    git commit -m "Atualizacao automatica - %TIMESTAMP%"
) else (
    echo [2/3] Arquivos locais ja preparados para envio.
)

echo [3/3] Enviando para o GitHub...
git push origin main

echo.
echo ==========================================================
echo  [OK] Site atualizado com sucesso!
echo  Aguarde ~2 minutos para as mudancas aparecerem online.
echo ==========================================================
echo.
pause
