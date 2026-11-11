# LOGISTEC-Mobile — paquete reparado para compilar APK

## Correcciones incluidas
- Se restauró la estructura real de carpetas: `.github/workflows/`, `mobile/`, `supabase/`, `icons/` y `scripts/`.
- Se ubicó el workflow en `.github/workflows/logistec.yml`, que es la ruta que GitHub Actions reconoce.
- Se actualizó `actions/setup-java` a `@v5`.
- Se eliminó la caché automática de Gradle: el proyecto Android y su `gradlew` se generan durante el paso de Capacitor, así que no existen todavía cuando se configura Java.
- Se evita instalar el paquete obsoleto `tools`; se instalan `platform-tools`, `platforms;android-36` y `build-tools;36.0.0`.
- El workflow crea/sincroniza el proyecto Android con Capacitor, compila `assembleDebug` y publica el APK como artefacto.

## Cómo usarlo
1. Extrae el ZIP en una carpeta.
2. Sube **el contenido conservando las carpetas** a la raíz del repositorio `Dark-bl/LOGISTEC-Mobile` (no subas el ZIP como un único archivo).
3. Confirma que GitHub muestre `.github/workflows/logistec.yml` y `mobile/package.json`.
4. Abre **Actions → LOGISTEC - Compilar APK Android → Run workflow**.
5. Cuando termine correctamente, descarga `LOGISTEC-Mobile-debug-APK` en Artifacts.

## Nota
Este paquete corrige la estructura y el flujo de compilación. La generación final del APK debe ejecutarse en GitHub Actions; no se afirma que el APK ya haya sido compilado o instalado en un dispositivo. No vuelvas a ejecutar migraciones SQL que ya aplicaste en Supabase.
