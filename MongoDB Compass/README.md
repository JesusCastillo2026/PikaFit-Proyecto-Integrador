# Archivos de referencia para MongoDB Compass

Esta carpeta describe las colecciones usadas por PikaFit. No contiene usuarios ni datos de ejemplo: así se evita importar cuentas ficticias o credenciales.

## Conectar Compass

1. Inicia MongoDB local y abre MongoDB Compass.
2. Conecta con `mongodb://127.0.0.1:27017`.
3. La aplicación crea o utiliza la base `pikafit_jesus` al iniciar.
4. Sus colecciones e índices se crean desde `src/db.js` cuando el servidor conecta.

Los archivos JSON de `esquemas/` son referencia del formato, no documentos para importar como datos. Para cargar datos reales, impórtalos únicamente con autorización y en la colección correspondiente.

## Colecciones

- `users`: socios, administradores y personal; contraseñas guardadas solo como hash.
- `medical_passes`: pases temporales, código/QR almacenados como digest y estado de uso.
- `role_audit`: registro de cambios de rol.
- `membership_notifications`: avisos internos por vencimiento.
- `medical_evaluations`: registros de evaluaciones contados por el reporte mensual.

Los índices vigentes están declarados en `src/db.js`.
