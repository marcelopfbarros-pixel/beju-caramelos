@echo off
chcp 65001 >nul
title JuJu Delivery - Encerrar Servidor Local
echo Encerrando servidor local na porta 5173...
set "FOUND="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    set "FOUND=1"
    echo Encerrando processo PID %%a...
    taskkill /PID %%a /F >nul 2>&1
)
if defined FOUND (
    echo [OK] Servidor local encerrado.
) else (
    echo [i] Nenhum servidor ativo encontrado na porta 5173.
)
timeout /t 2 >nul
