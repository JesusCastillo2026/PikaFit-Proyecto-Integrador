# PikaFit

PikaFit es una plataforma para administrar usuarios y roles, controlar membresías y facilitar la validación de pases médicos en clínicas afiliadas. Incluye una aplicación web, una aplicación Android y una API conectada a MongoDB.

## Funcionalidades

- Inicio de sesión con correo electrónico o DNI y contraseña.
- Administración de usuarios, personal clínico, permisos por rol y auditoría de cambios.
- Control de vigencia de membresías y bloqueo temporal configurable tras intentos fallidos de acceso.
- Generación de pases médicos temporales de un solo uso mediante QR o código alternativo.
- Validación de pases en recepción, consulta de historial y prevención de reutilización.
- Avisos internos sobre membresías próximas a vencer.
- Consulta de membresías próximas a vencer y reportes mensuales de actividad clínica con descarga CSV.
- Aplicación Android en Kotlin y Jetpack Compose, con sesión protegida mediante Android Keystore y AES-GCM.

## Tecnologías

- **Web y API:** Node.js, Express y JavaScript.
- **Aplicación móvil:** Kotlin, Jetpack Compose y Android SDK.
- **Base de datos:** MongoDB.
- **Pruebas:** Node.js Test Runner y MongoDB.

## Requisitos

- Node.js 20.19 o posterior.
- Git, para clonar el repositorio.
- MongoDB local o accesible mediante una URI.
- MongoDB Compass para explorar la base de datos (opcional).
- Android Studio y Android SDK para compilar y ejecutar la aplicación móvil.

## Configuración en otra computadora

Instala Node.js, Git y MongoDB en la nueva computadora. Instala Android Studio si también ejecutarás la aplicación móvil; MongoDB Compass es opcional. Clona el repositorio y entra a la carpeta descargada:

```powershell
git clone https://github.com/JesusCastillo2026/PikaFit-Proyecto-Integrador.git
Set-Location PikaFit-Proyecto-Integrador
npm ci
Copy-Item .env.example .env
```

Cada computadora debe tener su propio `.env`: configura la dirección de MongoDB, crea secretos JWT y de pases distintos y define una contraseña para el administrador inicial. No copies ni publiques un `.env` con secretos. Los documentos y cuentas de MongoDB tampoco se transfieren al clonar el código; si se requiere conservar datos, realiza y restaura una copia de seguridad autorizada por separado.

## Configuración de la API

Desde la carpeta del proyecto, instala dependencias y crea la configuración local:

```powershell
npm ci
Copy-Item .env.example .env
```

Edita `.env` y configura `MONGODB_URI`, `MONGODB_DB`, dos secretos distintos de al menos 32 caracteres (`JWT_SECRET` y `PASS_SECRET`) y las credenciales para crear el administrador inicial. `MEMBERSHIP_NOTICE_DAYS` define con cuántos días de anticipación se generan los avisos internos.

Inicia MongoDB y crea el administrador inicial:

```powershell
npm run seed:admin
```

Luego inicia la API y la interfaz web:

```powershell
npm start
```

La aplicación web estará disponible en `http://localhost:3000`, salvo que se configure otro puerto en `PORT`. El administrador inicial permite registrar socios y personal. Para las funciones de clínica, las cuentas de recepción y administración deben tener el mismo `clinicId`.

## MongoDB Compass

Conecta Compass a la dirección indicada por `MONGODB_URI` (por defecto, `mongodb://127.0.0.1:27017`). La base por defecto es `pikafit_jesus`. Al conectar la API, se crean las colecciones e índices declarados en `src/db.js`.

La carpeta [MongoDB Compass](MongoDB%20Compass/README.md) contiene el catálogo de colecciones, campos e índices. Sus esquemas sirven como referencia y no contienen datos de usuarios para importar.

## Aplicación Android

Abre la carpeta `Android` desde Android Studio, espera la sincronización de Gradle y ejecuta la configuración `app` en un emulador o dispositivo.

La URL de la API para el emulador está definida como `http://10.0.2.2:3100` en `Android/app/build.gradle.kts`. Configura `PORT=3100` en `.env` para que coincida. En un teléfono físico, configura la dirección IP local del equipo donde se ejecuta la API.

## Abrir y ejecutar cada programa

### Visual Studio Code: web y API

1. Abre Visual Studio Code y selecciona **Archivo > Abrir carpeta**.
2. Selecciona la carpeta raíz del proyecto, donde están `package.json`, `src`, `Web` y `Android`.
3. Abre **Terminal > Nuevo terminal**. La primera vez, ejecuta `npm ci`; crea `.env` desde `.env.example` y completa la configuración indicada arriba.
4. Inicia MongoDB y, la primera vez, ejecuta `npm run seed:admin` para crear la cuenta inicial.
5. En esa terminal ejecuta `npm start`. Abre `http://localhost:3000` en el navegador; si necesitas conectar también la app Android del emulador, configura `PORT=3100` y abre `http://localhost:3100`.

### MongoDB Compass: base de datos

1. Inicia el servicio de MongoDB y abre MongoDB Compass.
2. En **New Connection**, escribe la URI configurada en `.env`; para MongoDB local por defecto es `mongodb://127.0.0.1:27017`.
3. Pulsa **Connect** y busca la base `pikafit_jesus` (o el nombre configurado en `MONGODB_DB`).
4. Inicia la API desde Visual Studio Code. Al conectarse, la aplicación crea las colecciones e índices. La carpeta `MongoDB Compass/` documenta su estructura; sus archivos de esquemas no se importan como documentos.

### Android Studio: aplicación móvil

1. Abre Android Studio y elige **Open**.
2. Selecciona la carpeta `Android`, que contiene `settings.gradle.kts`.
3. Espera a que finalice la sincronización de Gradle. Si Android Studio solicita descargar componentes del SDK, instálalos desde el IDE.
4. En la barra superior selecciona la configuración **app** y un emulador iniciado o un dispositivo conectado.
5. Pulsa el botón verde **Run ▶**. Mantén la API ejecutándose en Visual Studio Code y configura `PORT=3100` para que coincida con la URL del emulador (`http://10.0.2.2:3100`). Para un teléfono físico, actualiza `API_BASE_URL` en `Android/app/build.gradle.kts` con la IP local del equipo.

## Pruebas

```powershell
npm test
```

Las pruebas usan una base temporal cuyo nombre comienza por `pikafit_test_` y la eliminan al finalizar. `MONGODB_URI` puede configurarse en el entorno para seleccionar la instancia de MongoDB de pruebas.

## Estructura del proyecto

- `src/`: API, autenticación, usuarios, pases, avisos, reportes y conexión a MongoDB.
- `Web/`: interfaz web para socios, administración y clínicas.
- `Android/`: aplicación móvil nativa.
- `MongoDB Compass/`: descripción de colecciones e índices para consulta en Compass.
- `scripts/seed-admin.js`: creación inicial del administrador.
- `tests/`: pruebas de integración.
