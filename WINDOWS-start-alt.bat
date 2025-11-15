@echo off
chcp 65001 >nul

REM Installer npm-pakker hvis nødvendig
if not exist node_modules (
  echo Kjører npm install ...
  npm install
)

REM Start start-helper.js i nytt vindu
start "Start-hjelper" cmd /k "node start-helper.js"

REM Vent litt så start-helper rekker å starte
ping 127.0.0.1 -n 3 >nul

REM Start applikasjonen i nytt vindu
start "Musikkvideouka" cmd /k "npm run dev"

echo Alt er startet! Du kan nå bruke START-HER.html i nettleseren.
pause
