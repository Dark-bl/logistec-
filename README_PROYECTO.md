# LOGISTEC — paquete plano para subir archivos a GitHub

Este ZIP no contiene subcarpetas: todos los archivos aparecen directamente en la raíz al extraerlo.

## Cómo subirlo

1. Extrae el ZIP en Windows.
2. En GitHub abre el repositorio y elige **Add file → Upload files**.
3. Selecciona todos los archivos extraídos y súbelos a la raíz del repositorio. No subas el ZIP como un único archivo.
4. Haz Commit changes.
5. Abre **Actions** y crea un workflow usando la plantilla **Android CI** (o **set up a workflow yourself**).
6. En el archivo de workflow generado, reemplaza todo su contenido por el de `GITHUB_WORKFLOW.yml`. Conserva la ruta que GitHub creó, normalmente `.github/workflows/android.yml`.
7. Guarda el workflow y abre **Actions → LOGISTEC - Compilar APK Android → Run workflow**.

## Por qué hay un script de reconstrucción

GitHub puede recibir los archivos desde una carpeta plana, pero Capacitor, Android y Supabase necesitan rutas de carpetas específicas para compilar y desplegar. El workflow ejecuta `RECONSTRUIR_LOGISTEC.py`, que crea esas rutas dentro del entorno temporal de compilación usando `MAPA_ARCHIVOS_LOGISTEC.json`. No tienes que crear las carpetas manualmente.

## Archivos web

`index.html`, `manifest.webmanifest`, `service-worker.js` y los iconos quedan en la raíz para que la versión web pueda publicarse sin directorios de imágenes.

## Seguridad y base de datos

No vuelvas a ejecutar migraciones SQL que ya aparecen aprobadas en tu Supabase. No publiques contraseñas, claves `service_role`, archivos `.env` ni tokens. El workflow de este paquete solo compila la APK; la Edge Function GPS ya fue desplegada por separado.

## Nota de verificación

Este paquete conserva los archivos fuente existentes y agrega el reconstruidor y el workflow. La APK todavía debe compilarse en GitHub Actions e instalarse en un Android real para aprobar GPS y segundo plano.
