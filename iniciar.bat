@echo off
title Comparador AR
cd /d "%~dp0"

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] No se encontro Node.js/npm. Instalalo desde https://nodejs.org/
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Instalando dependencias por primera vez...
    call npm install
)

echo.
echo Iniciando Comparador AR... se va a abrir el navegador solo.
echo Para cerrar: Ctrl+C en esta ventana.
echo.
call npm run dev -- --open
pause
