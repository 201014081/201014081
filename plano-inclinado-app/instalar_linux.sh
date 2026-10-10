#!/bin/bash
# Crea un lanzador "Plano Inclinado" en el Escritorio y en el menu de aplicaciones.
DIR="$(cd "$(dirname "$0")" && pwd)"
URL="file://$DIR/index.html"
NAV=""
for b in google-chrome chromium chromium-browser microsoft-edge; do command -v "$b" >/dev/null && NAV="$b" && break; done
if [ -n "$NAV" ]; then EXEC="$NAV --app=$URL --window-size=1400,900"; else EXEC="xdg-open $DIR/index.html"; fi
ESC="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
mkdir -p "$ESC" "$HOME/.local/share/applications"
for f in "$ESC/plano-inclinado.desktop" "$HOME/.local/share/applications/plano-inclinado.desktop"; do
  cat > "$f" <<EOS
[Desktop Entry]
Type=Application
Name=Plano Inclinado
Comment=Simulacion del Proyecto del Plano Inclinado
Exec=$EXEC
Icon=$DIR/icono.png
Terminal=false
Categories=Education;Science;
EOS
  chmod +x "$f"
  command -v gio >/dev/null && gio set "$f" metadata::trusted true 2>/dev/null
done
echo "Listo. Se creo el acceso directo 'Plano Inclinado'. No muevas esta carpeta."
