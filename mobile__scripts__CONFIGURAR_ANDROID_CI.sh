#!/usr/bin/env bash
set -euo pipefail

MOBILE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$MOBILE_ROOT"

printf '\n[1/5] Instalando dependencias de LOGISTEC Mobile...\n'
npm install --no-audit --no-fund

if [[ ! -d android ]]; then
  printf '\n[2/5] Generando proyecto Android con Capacitor...\n'
  npx cap add android
else
  printf '\n[2/5] Conservando proyecto Android existente...\n'
fi

printf '\n[3/5] Incorporando el servicio GPS nativo...\n'
SOURCE_ROOT="$MOBILE_ROOT/android-template/app/src/main/java/com/logistec/mobile"
TARGET_ROOT="$MOBILE_ROOT/android/app/src/main/java/com/logistec/mobile"
mkdir -p "$TARGET_ROOT/gps"
cp "$SOURCE_ROOT/MainActivity.java" "$TARGET_ROOT/MainActivity.java"
cp "$SOURCE_ROOT/gps/LogistecGpsPlugin.java" "$TARGET_ROOT/gps/LogistecGpsPlugin.java"
cp "$SOURCE_ROOT/gps/GpsForegroundService.java" "$TARGET_ROOT/gps/GpsForegroundService.java"

printf '\n[4/5] Configurando permisos y servicio Android...\n'
python3 "$MOBILE_ROOT/scripts/patch_android_manifest.py" "$MOBILE_ROOT/android/app/src/main/AndroidManifest.xml"

printf '\n[5/5] Construyendo web móvil y sincronizando Capacitor...\n'
npm run build
npx cap sync android

printf '\nProyecto Android listo para compilar con Gradle.\n'
