# ZeroXCryp para Android

ZeroXCryp es una aplicación Android nativa, instalada desde un APK. No es una PWA y no abre el gestor de claves dentro del navegador. La página de GitHub Pages sirve solamente para descargar el instalador.

## Instalar en Android

1. Abre [zeroxragde.github.io/ZeroXCryp](https://zeroxragde.github.io/ZeroXCryp/) en el teléfono.
2. Toca **Instalar ZeroXCryp para Android** y abre el archivo descargado.
3. Confirma la instalación. Android podría pedirte permitir instalaciones desde el navegador que usaste.
4. Abre ZeroXCryp, crea tu perfil, contraseña principal y clave extra.

Android muestra la confirmación de instalación por seguridad; una página no puede instalar una aplicación en silencio. El APK actual es una compilación de depuración firmada para instalación directa, no una publicación de Google Play.

## Cifrado y copias

- Los datos se guardan en una base SQLite privada de la app. La bóveda completa se cifra con AES-GCM; la clave se deriva de la contraseña principal con PBKDF2-HMAC-SHA256 y una sal aleatoria.
- Cada contraseña guardada tiene una segunda capa AES-GCM, con clave derivada de la clave extra y una sal independiente.
- La bóveda se bloquea tras cinco minutos sin actividad.
- **Copia / Drive** abre el selector de archivos de Android. Guarda el archivo JSON cifrado en Google Drive o en otra ubicación; para sincronizar otro teléfono, restaura esa copia en él.
- Si olvidas la contraseña principal o la clave extra, no existe recuperación del contenido protegido.

## Código y compilación

El módulo nativo está en `app/`. La compilación automática usa Java 17, Android SDK 35, Gradle 8.13 y Android Gradle Plugin 8.13.2. GitHub Actions genera `app-debug.apk`, lo publica como `downloads/ZeroXCryp.apk` en Pages y muestra el botón de descarga en la página.

La integración de Pages usa un flujo de GitHub Actions; consulta [la documentación de publicación personalizada de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## iPhone

Esta descarga es solo para Android. Una versión nativa de iPhone requiere un proyecto iOS y firma de Apple; no está incluida en este APK.
