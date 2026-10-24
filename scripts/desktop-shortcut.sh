#!/usr/bin/env bash
# Ajoute (ou retire avec --remove) l'icône EpiHub sur le bureau Ubuntu/GNOME.
# À lancer en utilisateur normal, après `sudo apt install ./dist/epihub_*.deb`.
set -euo pipefail

SRC=/usr/share/applications/epihub.desktop
DESKTOP_DIR=$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")
DEST="$DESKTOP_DIR/epihub.desktop"

if [ "${1:-}" = "--remove" ]; then
    rm -f "$DEST"
    echo "Icône retirée du bureau."
    exit 0
fi

if [ ! -f "$SRC" ]; then
    echo "EpiHub n'est pas installé. Lance d'abord : sudo apt install ./dist/epihub_0.1.0_amd64.deb" >&2
    exit 1
fi

mkdir -p "$DESKTOP_DIR"
cp "$SRC" "$DEST"
chmod +x "$DEST"
# GNOME n'autorise le lancement depuis le bureau que si le raccourci est marqué « de confiance ».
gio set "$DEST" metadata::trusted true 2>/dev/null || true
echo "Icône EpiHub ajoutée sur le bureau : $DEST"
