@echo off
start "Backend" cmd /k "cd /d %~dp0backend && python main.py"
start "Frontend" cmd /k "cd /d %~dp0frontend && python -m http.server 8080"
