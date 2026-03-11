@echo off
start "Backend" cmd /k "cd /d %~dp0backend && "C:\Program Files\Python311\python.exe" main.py"
start "Frontend" cmd /k "cd /d %~dp0frontend && "C:\Program Files\Python311\python.exe" -m http.server 8080"
