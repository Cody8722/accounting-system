@echo off

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /r "IPv4.*192\.168\."') do set LAN_IP=%%a
set LAN_IP=%LAN_IP: =%

echo ================================================
echo   Accounting System
echo ================================================
echo.
echo   Local:
echo     Frontend  http://localhost:8080
echo     Backend   http://localhost:5001
echo.
if defined LAN_IP (
    echo   LAN / Mobile ^(same Wi-Fi^):
    echo     Frontend  http://%LAN_IP%:8080
    echo     Backend   http://%LAN_IP%:5001
) else (
    echo   [LAN IP not found - check Wi-Fi]
)
echo.
echo ================================================
echo.

start "Backend"  cmd /k "cd /d %~dp0backend  && "C:\Program Files\Python311\python.exe" main.py"
start "Frontend" cmd /k "cd /d %~dp0frontend && "C:\Program Files\Python311\python.exe" -m http.server 8080 --bind 0.0.0.0"
