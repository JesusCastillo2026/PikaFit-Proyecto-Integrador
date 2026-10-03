require('dotenv').config();
const { connect, database, close } = require('../src/db');
const { createUser } = require('../src/users');

async function main() {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!email || !password) throw new Error('Configura ADMIN_SEED_EMAIL y ADMIN_SEED_PASSWORD en .env');
  await connect();
  const admins = await database().collection('users').countDocuments({ role: 'ADMIN' });
  if (admins > 0) throw new Error('Ya existe un administrador. No se creó otra cuenta.');
  const user = await createUser({ name: 'Administrador inicial', email, password, role: 'ADMIN' });
  console.log(`Administrador creado: ${user.email}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(close);
