# PikaFit — avance independiente

Prototipo independiente del proyecto integrador, desarrollado en un repositorio **nuevo y separado** del repositorio del equipo. Incluye los flujos de acceso, gestión de usuarios y roles, pases médicos, recepción clínica y aplicación móvil.

## Qué funciona

| Historias | Avance implementado |
| --- | --- |
| HU001–HU002 | Acceso con correo o DNI y contraseña, contraseñas protegidas con BCrypt, autenticación mediante JWT y manejo de sesión. El DNI identifica al usuario; también se requiere contraseña. |
| HU003–HU004 | Validación de vigencia de la membresía para generar pases y bloqueo temporal configurable después de varios intentos fallidos de acceso. |
| HU005–HU008 | Registro de usuarios y personal médico, asignación de roles, autorización por rol, cambio de permisos e historial de auditoría. |
| HU009–HU010 | Generación de pases temporales de un solo uso con QR y código alternativo de seis caracteres. La aplicación móvil muestra ambos y su tiempo restante. |
| HU011–HU012 | Validación de pases en recepción mediante cámara compatible o ingreso manual, prevención de reutilización e historial paginado y filtrable para la administración de la clínica. |

La interfaz web es adaptable a móviles. El lector de cámara usa `BarcodeDetector` si el navegador lo admite; también está disponible el ingreso manual del código. La aplicación Android nativa está desarrollada en Kotlin con Jetpack Compose, se conecta a la API y protege localmente el token de sesión mediante Android Keystore y AES-GCM.

## Puesta en marcha

Requiere Node.js 20.19+ y MongoDB local o remoto. Desde esta carpeta:

```powershell
npm install
Copy-Item .env.example .env
```

Edita `.env`: configura `MONGODB_URI`, dos secretos **diferentes** de al menos 32 caracteres (`JWT_SECRET` y `PASS_SECRET`) y una contraseña inicial fuerte en `ADMIN_SEED_PASSWORD`. La base indicada en `MONGODB_DB` debe ser exclusiva de esta instalación. Inicia MongoDB, luego ejecuta:

```powershell
npm run seed:admin
npm start
```

Abre `http://localhost:3000` (o el puerto configurado). El administrador inicial crea las cuentas de socios, personal y clínica. Para crear un socio activo, añade un vencimiento de membresía futuro. La cuenta de recepción y la de administración de clínica deben compartir el mismo identificador de clínica para consultar los pases correspondientes.

`npm test` ejecuta pruebas de integración con una base temporal cuyo nombre comienza por `pikafit_test_`. Para usar otra instancia en las pruebas, configura `MONGODB_URI` en el entorno antes de ejecutarlas. Las pruebas eliminan únicamente esa base temporal al terminar.

## Estructura

- `src/`: API Express, autenticación, usuarios, permisos, pases y conexión a MongoDB.
- `Web/`: interfaz web para socios, administración, recepción, historial y auditoría.
- `Android/`: aplicación móvil nativa en Kotlin con Jetpack Compose.
- `scripts/seed-admin.js`: alta única del administrador inicial.
- `tests/`: pruebas de los flujos principales.
- `.env.example`: configuración necesaria, sin credenciales reales.

## Alcance pendiente y revisión del equipo

Este prototipo no equivale a un producto final. Falta integrarlo con los demás módulos del proyecto, desplegarlo en un entorno de pruebas, recibir revisión de otro integrante y obtener la aprobación del Product Owner. Las pruebas de integración registradas alcanzan **91,23 % de líneas** y **69,93 % de ramas** en `src/` (medición documentada mediante `node --test --experimental-test-coverage tests/integration.test.js`); falta añadir pruebas unitarias y confirmar el criterio de cobertura del equipo. El acceso por DNI requiere contraseña como medida de seguridad. No se han modificado archivos ni commits del repositorio de Millones.
