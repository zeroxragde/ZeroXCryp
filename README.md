# ZeroXCryp

ZeroXCryp está disponible como aplicación web instalable (PWA) para Android y iPhone, además de conservar el APK nativo de Android. La PWA guarda su bóveda en IndexedDB del navegador y cifra el contenido antes de almacenarlo. No hay servidor de cuentas ni base de datos remota.

## Instalar en el teléfono

Abre <https://zeroxragde.github.io/ZeroXCryp/> usando Safari en iPhone o Chrome en Android. Pulsa **Instalar** y sigue las instrucciones. En iPhone: Compartir → Añadir a pantalla de inicio. En Android, acepta el diálogo de instalación o usa el menú del navegador.

La página debe abrirse por HTTPS. Si no aparece el diálogo de Android, el menú de Chrome ofrece **Instalar aplicación** o **Añadir a pantalla de inicio**. iOS muestra las instrucciones de Safari desde el botón.

## Bóveda web

- El perfil y la bóveda cifrada se guardan localmente en el navegador; cada navegador y dispositivo tienen su propio almacenamiento.
- Contraseña principal y clave extra deben ser diferentes y tener al menos 12 caracteres.
- La bóveda se cifra con AES-GCM de 256 bits; la llave se deriva con PBKDF2-HMAC-SHA-256 y 310 000 iteraciones. Cada contraseña tiene su propio cifrado AES-GCM con sal independiente y la clave extra.
- El navegador se bloquea al ocultar la app y tras cinco minutos de inactividad.
- **Copia cifrada** exporta el contenedor cifrado como JSON. Guarda ese archivo en un lugar seguro (puedes elegir Google Drive desde el selector de archivos del teléfono) e impórtalo en el otro dispositivo. La copia no sincroniza automáticamente.
- Si limpias los datos del navegador o pierdes las claves, podrías perder acceso a la bóveda. Conserva una copia cifrada.

## App Android nativa

El APK Android continúa disponible desde **APK nativo para Android** en la página. Su base SQLite es independiente del almacenamiento web de Chrome. La app nativa también permite guardar/restaurar copias cifradas.

## Desarrollo y despliegue

La interfaz PWA está en `index.html`, `styles.css` y `app.js`, con el manifiesto `manifest.webmanifest` y service worker `sw.js`. La acción de GitHub compila el APK Android y despliega ambos formatos en GitHub Pages. El registro de claves, desbloqueo, cifrado, edición, eliminación, copia y restauración se deben probar manualmente en Android/Chrome y iPhone/Safari antes de usar la bóveda con secretos reales.
