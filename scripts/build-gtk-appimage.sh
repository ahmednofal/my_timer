#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Interval Timer GTK"
APP_ID="com.nofal.interval-timer-gtk"
APP_DIR="$ROOT_DIR/build/gtk-appimage/AppDir"
APPIMAGE_TOOL="$ROOT_DIR/build/gtk-appimage/appimagetool-x86_64.AppImage"
OUT_DIR="$ROOT_DIR/release"
VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/usr/bin" "$APP_DIR/usr/share/my_timer" "$APP_DIR/usr/share/icons/hicolor/256x256/apps"

cp -r "$ROOT_DIR/gtk_app" "$APP_DIR/usr/share/my_timer/"
cp -r "$ROOT_DIR/dist" "$APP_DIR/usr/share/my_timer/"
cp "$ROOT_DIR/public/vite.svg" "$APP_DIR/usr/share/icons/hicolor/256x256/apps/interval-timer-gtk.svg"
cp "$ROOT_DIR/public/vite.svg" "$APP_DIR/interval-timer-gtk.svg"

cat > "$APP_DIR/usr/bin/interval-timer-gtk" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export GDK_BACKEND=x11
exec python3 "$HERE/share/my_timer/gtk_app/timer.py"
EOF
chmod +x "$APP_DIR/usr/bin/interval-timer-gtk"

cat > "$APP_DIR/interval-timer-gtk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$APP_NAME
Exec=interval-timer-gtk
Icon=interval-timer-gtk
Categories=Utility;
Terminal=false
StartupNotify=true
X-AppImage-Version=$VERSION
EOF

cat > "$APP_DIR/AppRun" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export PATH="$HERE/usr/bin:$PATH"
exec "$HERE/usr/bin/interval-timer-gtk"
EOF
chmod +x "$APP_DIR/AppRun"

if [[ ! -f "$APPIMAGE_TOOL" ]]; then
  mkdir -p "$(dirname "$APPIMAGE_TOOL")"
  curl -L "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage" -o "$APPIMAGE_TOOL"
  chmod +x "$APPIMAGE_TOOL"
fi

mkdir -p "$OUT_DIR"
ARCH=x86_64 "$APPIMAGE_TOOL" "$APP_DIR" "$OUT_DIR/Interval Timer GTK-$VERSION-x86_64.AppImage"

echo "Built: $OUT_DIR/Interval Timer GTK-$VERSION-x86_64.AppImage"
