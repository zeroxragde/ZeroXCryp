# ZeroXCryp

ZeroXCryp es una bóveda de contraseñas instalable como PWA en Android y iPhone. Guarda una copia cifrada localmente en el navegador del dispositivo; no tiene servidor, registro en línea ni base de datos MySQL. El archivo de respaldo opcional también está cifrado antes de salir del dispositivo.

## Usar e instalar

La app debe publicarse en un origen HTTPS para habilitar el almacenamiento cifrado, el modo sin conexión y la instalación. Es una app estática: puedes alojar estos archivos en GitHub Pages, Cloudflare Pages o cualquier hosting HTTPS. No necesita Mac ni cuenta de desarrollador de Apple.

Para GitHub Pages, crea un repositorio llamado `ZeroXCryp`, sube estos archivos a la rama `main` y en **Settings → Pages** selecciona **GitHub Actions** como fuente. El flujo incluido publica el sitio automáticamente en `https://zeroxragde.github.io/ZeroXCryp/` después del primer push.

- **Android:** abre el sitio con Chrome y elige **Instalar app** o **Añadir a pantalla de inicio**.
- **iPhone:** abre el sitio con Safari, toca **Compartir → Añadir a pantalla de inicio** y activa **Abrir como app web** si aparece. Apple documenta estos pasos en [su guía para iPhone](https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7).
- Después de cargarla una vez, el cascarón de la app funciona sin conexión. Las copias de Drive requieren conexión.

Para desarrollo local en esta computadora, abre PowerShell en esta carpeta y ejecuta `npx serve .`; luego abre la dirección que indique. `localhost` es un contexto seguro para desarrollo. Para instalarla en un teléfono, usa un hosting HTTPS.

## Cifrado y almacenamiento

- La bóveda completa se cifra con AES-256-GCM. La clave se deriva de la contraseña principal mediante PBKDF2-SHA-256 con una sal aleatoria y 310 000 iteraciones.
- Cada contraseña almacenada recibe otra capa AES-256-GCM cuya clave se deriva de la clave extra y una sal individual. Se pide esa clave al guardar, revelar o copiar una contraseña.
- Nombre, correo, sitios, usuarios y metadatos quedan dentro de la bóveda cifrada. Solo quedan en IndexedDB los parámetros criptográficos y el texto cifrado.
- La bóveda se bloquea después de cinco minutos sin actividad. Si olvidas cualquiera de las dos claves, no hay restablecimiento ni recuperación del contenido cifrado.
- Una copia JSON de ZeroXCryp contiene el contenedor cifrado completo. Guarda al menos una copia fuera del mismo dispositivo antes de cambiar de teléfono o borrar los datos del navegador.

## Google Drive opcional

Google requiere que configures un cliente OAuth propio para que una app web solicite acceso a Drive. La app solo pide el permiso `drive.appdata` y usa la carpeta privada de datos de la aplicación; sube el contenedor cifrado, no las claves en texto legible.

1. En Google Cloud Console, crea un proyecto y habilita **Google Drive API**.
2. Configura la pantalla de consentimiento OAuth y crea un ID de cliente OAuth de tipo **Aplicación web**.
3. Añade el dominio HTTPS donde alojes ZeroXCryp en **Orígenes autorizados de JavaScript**.
4. En ZeroXCryp, abre **Copia y sincronización**, pega el ID de cliente y pulsa **Guardar ID**.
5. Usa **Subir / actualizar** para guardar la copia cifrada en Drive. En otro teléfono, abre la misma versión de ZeroXCryp, autoriza el mismo cliente OAuth y pulsa **Restaurar desde Drive**.

El botón de subir reemplaza la copia de ZeroXCryp de esa carpeta privada con el estado actual del dispositivo. Si alternas varios dispositivos, sube la bóveda actualizada desde el dispositivo que usaste; revisa antes de restaurar porque restaurar reemplaza la bóveda local.

## Limitaciones

Esta primera versión es local-first y no incluye backend MySQL: para usar MySQL haría falta contratar/configurar un servidor y añadir una API, lo que cambia el modelo de almacenamiento privado. La bóveda no se sincroniza automáticamente en segundo plano; el respaldo de Drive se inicia manualmente. Los iconos de tarjetas usan iniciales para que la app no consulte sitios externos.
