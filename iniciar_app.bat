@echo off
chcp 65001 >nul
title JuJu Delivery - Gestao de Pedidos e Confeitaria
echo ===================================================
echo           JuJu Delivery - App Local
echo ===================================================
echo.

cd /d "%~dp0"

:: Localizar Chrome
set "CHROME_EXE="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

:: Verifica se a porta 5173 ja esta ativa
netstat -ano | findstr :5173 | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo [i] O servidor ja esta em execucao na porta 5173.
    echo [i] Abrindo no Chrome...
    if defined CHROME_EXE (
        start "" "%CHROME_EXE%" --app=http://localhost:5173 --window-size=1600,920
    ) else (
        start "" http://localhost:5173
    )
    timeout /t 2 >nul
    exit
)

echo [1/2] Aguardando servidor para abrir no Chrome em http://localhost:5173...
start /min "" powershell -NoProfile -WindowStyle Hidden -Command "$deadline=(Get-Date).AddSeconds(25); while((Get-Date) -lt $deadline){ try{ $c=New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1',5173); $c.Close(); break } catch{ Start-Sleep -Milliseconds 300 } }; if($env:CHROME_EXE -and (Test-Path $env:CHROME_EXE)){ Start-Process -FilePath $env:CHROME_EXE -ArgumentList '--app=http://localhost:5173','--window-size=1600,920' } else { Start-Process 'http://localhost:5173' }"

echo [2/2] Iniciando servidor JuJu Delivery...
echo.
echo ===================================================
echo  Servidor ativo! Para encerrar, feche esta janela.
echo ===================================================
echo.

npm run dev
pause
