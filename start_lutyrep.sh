#!/bin/bash
# Lutyrep – Start-Skript für macOS/Linux
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[FEHLER] Node.js wurde nicht gefunden."
  echo "Bitte zuerst installieren: https://nodejs.org/ (LTS-Version)"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Erst-Einrichtung läuft, bitte kurz warten..."
  npm install
fi

echo "Starte Lutyrep-Server..."
nohup node server.js > lutyrep_server.log 2>&1 &
echo $! > lutyrep_server.pid
sleep 2

URL="http://localhost:3000/index.html"
if command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 || echo "Bitte im Browser öffnen: $URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || echo "Bitte im Browser öffnen: $URL"
else
  echo "Bitte im Browser öffnen: $URL"
fi

echo ""
echo "Lutyrep läuft im Hintergrund (PID $(cat lutyrep_server.pid))."
echo "Beenden mit: ./stop_lutyrep.sh"
echo ""
echo "Andere Rechner im selben Netzwerk erreichen Lutyrep unter:"
echo "   http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo DIESER-RECHNER-IP):3000"
