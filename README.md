# PikaFit — avance independiente

Prototipo del proyecto integrador creado en un repositorio **nuevo y separado** del repositorio del equipo. Implementa los flujos programados hasta el **15 de octubre de 2026** en el plan diario Scrum (días 1 a 10 del sprint 1, HU001 a HU012). Las fechas de los commits se asignaron según el cronograma del proyecto y no acreditan el momento real de desarrollo de cada cambio.

## Qué funciona

| Historias | Avance implementado |
| --- | --- |
| HU001–HU002 | Acceso por correo o DNI con contraseña, hash BCrypt, JWT y manejo de sesión. El DNI solo identifica al usuario; también se pide contraseña. |
| HU003–HU004 | Bloqueo de generación de pases al vencer la membresía; bloqueo temporal tras intentos fallidos de acceso, configurable por entorno. |
| HU005–HU008 | Alta de usuarios y personal médico, roles, permisos por rol, cambio de rol y auditoría de esos cambios. |
| HU009–HU010 | Pase temporal de un solo uso con QR y código alternativo de seis caracteres. |
| HU011–HU012 | Validación del pase por recepción, prevención de reutilización e historial filtrable para la administración de la clínica. |

La interfaz web es adaptable a móvil. El lector de cámara usa `BarcodeDetector` si el navegador lo admite; siempre queda disponible la entrada manual del código.

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
- `public/`: interfaz web para socios, administración, recepción y auditoría.
- `scripts/seed-admin.js`: alta única del administrador inicial.
- `tests/`: pruebas de los flujos principales.
- `.env.example`: configuración necesaria, sin credenciales reales.

## Alcance pendiente y revisión del equipo

Este avance no equivale a un producto final ni a diez jornadas ya trabajadas. Faltan la integración con los demás módulos del proyecto, un cliente Android nativo si el equipo lo exige, despliegue en staging, revisión por otro integrante y aprobación del Product Owner. Las pruebas de integración actuales alcanzan **91,23 % de líneas** y **69,93 % de ramas** en `src/` (medidas con `node --test --experimental-test-coverage tests/integration.test.js`); sigue pendiente añadir pruebas unitarias y revisar el criterio exacto de cobertura del equipo. El acceso por DNI descrito originalmente sin una segunda credencial se adaptó para exigir contraseña por seguridad; el equipo debe aprobar este ajuste. No se han modificado archivos ni commits del repositorio de Millones.
