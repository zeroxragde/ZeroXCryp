# ZeroXCryp para Android

ZeroXCryp es una aplicación Android nativa. La página de GitHub Pages solo ofrece el APK; no guarda ni administra contraseñas. La bóveda se almacena en SQLite dentro del espacio privado de la app.

## Instalar

1. Abre <https://zeroxragde.github.io/ZeroXCryp/> desde tu teléfono Android.
2. Pulsa **Descargar e instalar ZeroXCryp** y abre el archivo APK descargado.
3. Autoriza temporalmente la instalación desde tu navegador si Android lo solicita y confirma.
4. Crea tu perfil, contraseña principal y clave extra.

La compilación actual es el APK de depuración que genera GitHub Actions para instalación directa; no está publicado en Google Play.

## Protección y copias

- La base SQLite privada guarda la bóveda cifrada con AES-GCM. La clave principal se deriva mediante PBKDF2-HMAC-SHA256 y sal aleatoria.
- Cada contraseña tiene una capa AES-GCM adicional cifrada con una clave derivada de la clave extra y una sal propia.
- La pantalla se bloquea después de cinco minutos de inactividad.
- **Copia / Drive** abre el selector de documentos Android para guardar/restaurar el archivo JSON cifrado. Puedes elegir Google Drive como destino. El respaldo no sincroniza automáticamente.
- En **Copia / Drive** o **Ajustes** puedes usar **Exportar JSON con claves** para crear un archivo JSON con nombre, URL, usuario y contraseñas ya descifradas. La app avisa y pide la clave extra antes de prepararlo. Ese archivo queda sin cifrar: guárdalo solo en una ubicación protegida y elimínalo cuando ya no lo necesites.
- Guarda el respaldo antes de reinstalar o actualizar. Si pierdes la contraseña principal o la clave extra no hay recuperación.

## Interfaz y compilación

La interfaz nativa se construye en Java en `app/src/main/java/com/zeroxcryp/MainActivity.java`. Usa un tema oscuro fijo, acento verde lima, superficies elevadas, campos redondeados y tarjetas para los accesos. La acción de GitHub compila el APK y publica el enlace de descarga en GitHub Pages.
