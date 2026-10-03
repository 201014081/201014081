#!/bin/bash
# Crea "Plano Inclinado.command" en el Escritorio de macOS.
DIR="$(cd "$(dirname "$0")" && pwd)"
LANZADOR="$HOME/Desktop/Plano Inclinado.command"
cat > "$LANZADOR" <<EOS
#!/bin/bash
URL="file://$DIR/index.html"
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="\$URL" --window-size=1400,900
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -na "Microsoft Edge" --args --app="\$URL" --window-size=1400,900
else
  open "$DIR/index.html"
fi
EOS
chmod +x "$LANZADOR"
echo "Listo. Se creo 'Plano Inclinado' en tu Escritorio. No muevas esta carpeta."
