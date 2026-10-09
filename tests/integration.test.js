const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27018';
process.env.MONGODB_DB = `pikafit_test_${crypto.randomBytes(6).toString('hex')}`;
process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('hex');
process.env.PASS_SECRET ||= crypto.randomBytes(32).toString('hex');

const { connect, database, close } = require('../src/db');
const { app } = require('../src/server');
const { createUser } = require('../src/users');

let server;
let base;

async function request(method, path, body, token) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}

async function signIn(email, password = 'ClaveSegura123!') {
  const result = await request('POST', '/api/auth/login', { email, password });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data.token;
}

before(async () => {
  await connect();
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  await createUser({ name: 'Administradora', email: 'admin@example.com', password: 'ClaveSegura123!', role: 'ADMIN' });
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (database) {
    try { await database().dropDatabase(); } catch { /* No se conectó durante la preparación. */ }
  }
  await close();
});

test('acceso, registro y permisos por rol', async () => {
  const health = await request('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal((await request('GET', '/api/users')).status, 401);

  const admin = await signIn('admin@example.com');
  const created = await request('POST', '/api/users', {
    name: 'Socia Activa', email: 'socia@example.com', dni: '12345678',
    password: 'ClaveSegura123!', role: 'SOCIO', membershipExpiresAt: '2027-10-15',
  }, admin);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.user.dni, '12345678');
  assert.equal(created.data.user.passwordHash, undefined);

  const byDni = await request('POST', '/api/auth/login', { dni: '12345678', password: 'ClaveSegura123!' });
  assert.equal(byDni.status, 200);
  assert.equal((await request('GET', '/api/users', undefined, byDni.data.token)).status, 403);
  assert.equal((await request('POST', '/api/auth/login', { dni: '12345678' })).status, 400);

  const expired = await request('POST', '/api/users', {
    name: 'Socio Vencido', email: 'vencido@example.com', password: 'ClaveSegura123!',
    membershipExpiresAt: '2026-01-01',
  }, admin);
  assert.equal(expired.status, 201);
  const expiredToken = await signIn('vencido@example.com');
  const blocked = await request('POST', '/api/medical-passes', {}, expiredToken);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'membership_expired');

  const changed = await request('PATCH', `/api/users/${created.data.user.id}/role`, { role: 'COACH' }, admin);
  assert.equal(changed.status, 200);
  assert.equal(changed.data.user.role, 'COACH');
  assert.equal((await request('GET', '/api/me', undefined, byDni.data.token)).status, 401);
  const audit = await request('GET', '/api/audit/roles', undefined, admin);
  assert.equal(audit.status, 200);
  assert.equal(audit.data.total, 1);
  assert.equal(audit.data.items[0].newRole, 'COACH');
});

test('bloqueo de cuenta tras fallos de contraseña', async () => {
  await createUser({ name: 'Prueba Bloqueo', email: 'bloqueo@example.com', password: 'ClaveSegura123!' });
  for (let i = 0; i < 4; i++) {
    const result = await request('POST', '/api/auth/login', { email: 'bloqueo@example.com', password: 'Incorrecta123!' });
    assert.equal(result.status, 401);
  }
  const locked = await request('POST', '/api/auth/login', { email: 'bloqueo@example.com', password: 'Incorrecta123!' });
  assert.equal(locked.status, 423);
  assert.equal((await request('POST', '/api/auth/login', { email: 'bloqueo@example.com', password: 'ClaveSegura123!' })).status, 423);
});

test('pase QR o código único, uso único e historial por clínica', async () => {
  const admin = await signIn('admin@example.com');
  const reception = await request('POST', '/api/users', {
    name: 'Recepción Norte', email: 'recepcion@example.com', password: 'ClaveSegura123!',
    role: 'RECEPCION_CLINICA', clinicId: 'clinica-norte',
  }, admin);
  assert.equal(reception.status, 201);
  const clinicAdmin = await request('POST', '/api/users', {
    name: 'Jefe Clínica', email: 'clinica@example.com', password: 'ClaveSegura123!',
    role: 'ADMIN_CLINICA', clinicId: 'clinica-norte',
  }, admin);
  assert.equal(clinicAdmin.status, 201);
  const member = await request('POST', '/api/users', {
    name: 'Socio QR', email: 'qr@example.com', password: 'ClaveSegura123!',
    membershipExpiresAt: '2027-10-15',
  }, admin);
  assert.equal(member.status, 201);

  const memberToken = await signIn('qr@example.com');
  const receptionToken = await signIn('recepcion@example.com');
  const clinicToken = await signIn('clinica@example.com');
  const pass = await request('POST', '/api/medical-passes', {}, memberToken);
  assert.equal(pass.status, 201, JSON.stringify(pass.data));
  assert.match(pass.data.pass.qrDataUrl, /^data:image\/png;base64,/);
  assert.match(pass.data.pass.code, /^[A-Z2-9]{6}$/);
  assert.equal((await request('POST', '/api/clinic/passes/validate', { code: pass.data.pass.code }, memberToken)).status, 403);

  const used = await request('POST', '/api/clinic/passes/validate', { code: pass.data.pass.code }, receptionToken);
  assert.equal(used.status, 200, JSON.stringify(used.data));
  assert.equal((await request('POST', '/api/clinic/passes/validate', { token: pass.data.pass.token }, receptionToken)).status, 409);
  const history = await request('GET', '/api/clinic/passes/history', undefined, clinicToken);
  assert.equal(history.status, 200);
  assert.equal(history.data.total, 1);
  assert.equal(history.data.items[0].memberName, 'Socio QR');
});
