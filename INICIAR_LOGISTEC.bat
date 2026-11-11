@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo No se encontro Python Launcher.
  echo Abre Visual Studio Code y ejecuta index.html con Live Server.
  pause
  exit /b 1
)
start "LOGISTEC - servidor local" cmd /k "cd /d ""%~dp0"" && py -m http.server 5500 --bind 127.0.0.1"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:5500"
