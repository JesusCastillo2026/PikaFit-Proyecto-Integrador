# PikaFit — cierre funcional de los cuatro sprints

## Alcance entregado

PikaFit integra una aplicación web, una app Android, una API Node.js y persistencia MongoDB. Las funciones se organizan por flujo de producto; no se asignan códigos HU que no estén definidos en el material del equipo.

| Sprint | Alcance | Evidencia en el repositorio |
|---|---|---|
| 1. Acceso y membresías | Inicio de sesión por correo/DNI, contraseñas protegidas, autorización por rol, vigencia de membresía, pase médico QR/código de un solo uso, validación e historial por clínica, avisos de vencimiento. | `src/auth.js`, `src/users.js`, `src/passes.js`, `src/membership-notices.js`, `src/clinic-reports.js`; rutas `/api/auth`, `/api/medical-passes` y `/api/clinic`; panel web de socio, recepción y administración clínica. |
| 2. Gestión de gimnasio y entrenamiento | Sedes y máquinas, estados e historial de disponibilidad, ejercicios, evaluación médica, generación de rutina segura, sesión de entrenamiento, registro de series, historial y esfuerzo percibido. | `src/training.js`, `src/training-domain.js`, `src/workouts.js`; rutas `/api/sites`, `/api/exercises`, `/api/me/routines` y `/api/me/training`; pantallas de entrenamiento web y Android. |
| 3. Seguimiento y personalización | Adaptación por fatiga, reporte de molestias y sustitución segura, restricciones médicas para coach, panel de seguimiento, guías nutricionales y videos de ejercicios con control de tipo/tamaño. | `src/sprint3.js`; pruebas de dominio de sprint 3; rutas `/api/me/fatigue-reports`, `/discomfort`, `/api/coach`, `/api/me/nutrition-guides` y `/api/exercises/:id/media`; panel web y flujos móviles. |
| 4. Clínicas, seguridad y cierre | Ficha médica cifrada y PDF, auditoría de cambios de rol, informes por clínica con exportación CSV, controles de acceso, sesión móvil cifrada con Android Keystore/AES-GCM, instrucciones de instalación y configuración. | `src/clinical-crypto.js`, `src/clinic-reports.js`, `src/server.js`, `Android/.../SessionStore.kt`, `MongoDB Compass/esquemas/colecciones.json`, pruebas y documentación raíz. |

## Verificación local

Requisitos: Node.js 20.19+, MongoDB y Android Studio con Android SDK. MongoDB Compass es opcional y permite explorar las colecciones.

1. Instalar: `npm ci`.
2. Crear `.env` desde `.env.example`; sustituir ambos secretos por valores aleatorios distintos de al menos 32 caracteres y configurar MongoDB. Para guardar evaluaciones clínicas, configurar además `CLINICAL_ENCRYPTION_KEY` con 64 caracteres hexadecimales aleatorios.
3. Iniciar MongoDB, crear administrador inicial con `npm run seed:admin` y ejecutar la API con `npm start`.
4. Abrir `http://localhost:3000`. Para el emulador Android, configurar `PORT=3100` y ejecutar la app en Android Studio; el emulador usa `http://10.0.2.2:3100`.
5. Ejecutar las pruebas de dominio con `node --test tests/clinical-crypto.test.js tests/medical-pdf.test.js tests/sprint3-domain.test.js tests/training-domain.test.js`. La suite completa requiere MongoDB de pruebas en `127.0.0.1:27018`: `npm test`.

Las cuentas de demostración se crean con el seed del administrador y el formulario de administración; no se guardan contraseñas de prueba ni secretos dentro del repositorio. Cada evaluador debe configurar sus propias credenciales.

## Límite de comprobación

El código y la documentación describen un producto listo para configurar. El repositorio no incluye credenciales de producción, instancia de MongoDB hospedada, publicación web ni cuentas Firebase; estos recursos dependen de las cuentas y secretos del equipo. No se afirma que el despliegue remoto o la compilación Android se hayan verificado sin sus dependencias y configuración.
