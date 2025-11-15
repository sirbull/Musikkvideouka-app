#!/bin/bash
cd "$(dirname "$0")"

# Installer npm-pakker hvis nødvendig
if [ ! -d "node_modules" ]; then
  echo "Kjører npm install ..."
  npm install
fi

# Start start-helper.js i nytt Terminal-vindu
osascript <<END
 tell application "Terminal"
   do script "cd '$(pwd)'; node start-helper.js"
 end tell
END

# Vent litt så start-helper rekker å starte
sleep 2

# Start applikasjonen i nytt Terminal-vindu
osascript <<END
 tell application "Terminal"
   do script "cd '$(pwd)'; npm run dev"
 end tell
END

echo "Alt er startet! Du kan nå bruke START-HER.html i nettleseren."
