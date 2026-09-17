@echo off
title Atualizar Site - Da Serra Ambiental
echo ==========================================================
echo     Atualizando o site do Geoportal Da Serra Ambiental
echo ==========================================================
echo.
cd /d "%~dp0"

echo [1/3] Compilando arquivos GeoJSON para geojson_data.js...
py build_data.py
echo.
echo [OK] Dados compilados localmente com sucesso!
echo.

where git >nul 2>&1
if errorlevel 1 goto NO_GIT

if not exist ".git" goto NO_GIT_REPO

echo [2/3] Verificando alteracoes para envio ao GitHub...
git add -A

git diff --cached --quiet
if errorlevel 1 (
    git commit -m "Atualizacao automatica das camadas"
)

echo [3/3] Enviando alteracoes para o GitHub...
git push origin main

echo.
echo ==========================================================
echo  [OK] Site na WEB atualizado com sucesso!
echo  Aguarde 1 minuto para as mudancas aparecerem online.
echo ==========================================================
echo.
pause
exit /b 0

:NO_GIT
echo ==========================================================
echo  [AVISO] Git nao instalado ou pasta nao conectada na WEB.
echo.
echo  O mapa LOCAL (no seu computador) ja foi atualizado!
echo  Para enviar para a WEB a partir deste PC pessoal:
echo    1. Baixe e instale o Git: https://git-scm.com/download/win
echo    2. Ou use o aplicativo GitHub Desktop.
echo ==========================================================
echo.
pause
exit /b 0

:NO_GIT_REPO
echo ==========================================================
echo  [AVISO] Pasta nao conectada ao GitHub neste PC.
echo.
echo  O mapa LOCAL (no seu computador) ja foi atualizado!
echo  Para conectar este PC ao GitHub, abra o GitHub Desktop.
echo ==========================================================
echo.
pause
exit /b 0
