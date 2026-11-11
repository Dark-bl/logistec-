# LOGISTEC Mobile — paquete plano para GitHub

Este ZIP contiene **todos los archivos en una sola carpeta**, sin subcarpetas dentro del ZIP. Los nombres que contienen `__` representan rutas internas del proyecto. No cambies esos nombres.

## 1. Subir los archivos

1. Descarga y extrae este ZIP en Windows.
2. En GitHub abre el repositorio `LOGISTEC-Mobile`.
3. Selecciona **Add file → Upload files**.
4. Selecciona todos los archivos extraídos y súbelos a la raíz del repositorio. No subas el ZIP como un único archivo.
5. Haz clic en **Commit changes**.

## 2. Crear el workflow (solo una vez)

GitHub Actions solo reconoce workflows dentro de `.github/workflows/`. Para evitar subir subcarpetas, crea ese único archivo desde GitHub:

1. Abre la pestaña **Actions**.
2. Selecciona **New workflow** y luego **set up a workflow yourself** (o la opción equivalente).
3. GitHub abrirá el editor con una ruta dentro de `.github/workflows/`. Conserva esa ruta y usa un nombre como `android.yml`.
4. Abre el archivo plano `GITHUB_WORKFLOW.yml` de este paquete, copia todo su contenido y pégalo en el editor de GitHub.
5. Pulsa **Commit changes**.

## 3. Qué hará la compilación

El workflow reconstruye automáticamente las rutas `mobile/`, `icons/`, `supabase/`, `scripts/` y `docs/` dentro del entorno temporal de GitHub Actions mediante `RECONSTRUIR_LOGISTEC.py`. Después instala Node.js y Java, configura Android SDK, prepara Capacitor, compila `assembleDebug` y publica el APK como artefacto.

Cuando termine, abre **Actions → la ejecución más reciente → Artifacts** y descarga `LOGISTEC-Mobile-debug-APK`.

## Importante

- No necesitas crear manualmente las subcarpetas del proyecto.
- Debes crear una sola vez el workflow por medio de la pestaña Actions, porque GitHub exige que su archivo esté en `.github/workflows/`.
- El paquete no contiene un APK ya compilado. La compilación debe ejecutarse en GitHub Actions.
- No subas claves privadas, contraseñas, tokens ni archivos `.env`.
- No vuelvas a ejecutar migraciones SQL que ya aplicaste en Supabase.
