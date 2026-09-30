@echo off
setlocal
cd /d "%~dp0"

echo.
echo ============================================================
echo   Rightly - RTL for GPT + Claude + ChatGPT in Chrome
echo ============================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set EXITCODE=%ERRORLEVEL%

echo.
if %EXITCODE% NEQ 0 (
    echo [X] Installation failed with exit code %EXITCODE%.
) else (
    echo [+] Installation completed.
)
echo.
pause
exit /b %EXITCODE%
