#!/bin/bash
# Lutyrep – Server stoppen (macOS/Linux)
cd "$(dirname "$0")"
if [ -f lutyrep_server.pid ]; then
  PID=$(cat lutyrep_server.pid)
  kill "$PID" 2>/dev/null && echo "Lutyrep-Server (PID $PID) gestoppt." || echo "Prozess war nicht mehr aktiv."
  rm -f lutyrep_server.pid
else
  echo "Keine laufende Lutyrep-Instanz gefunden (lutyrep_server.pid fehlt)."
fi
