const express = require('express');
const path = require('node:path');
const { database, connect, close } = require('./db');
const config = require('./config');
const { HttpError, asyncRoute, text, dateOrNull } = require('./http');
const { login, authenticate, requireRole, activeMembership } = require('./auth');
const { ROLES, createUser, publicUser, userId } = require('./users');
const { createPass, validatePass, history } = require('./passes');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'");
  next();
});

app.get('/api/health', asyncRoute(async (_req, res) => {
  await database().command({ ping: 1 });
  res.json({ status: 'ok' });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  res.json(await login(req.body || {}));
}));

app.get('/api/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));
app.get('/api/roles', authenticate, requireRole('ADMIN'), (_req, res) => res.json({ roles: ROLES }));

app.get('/api/users', authenticate, requireRole('ADMIN'), asyncRoute(async (_req, res) => {
  const users = await database().collection('users').find({}).sort({ createdAt: -1 }).limit(100).toArray();
  res.json({ items: users.map(publicUser) });
}));

app.post('/api/users', authenticate, requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const user = await createUser(req.body || {});
  res.status(201).json({ user });
}));

app.post('/api/admin/medical-staff', authenticate, requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const user = await createUser({ ...req.body, role: 'MEDICO' });
  res.status(201).json({ user });
}));

app.patch('/api/users/:id/role', authenticate, requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const role = text(req.body?.role, 'rol', 50);
  if (!ROLES.includes(role)) throw new HttpError(400, 'Rol inválido', 'invalid_role');
  const id = userId(req.params.id);
  if (String(id) === String(req.user._id)) throw new HttpError(400, 'Otro administrador debe cambiar tu rol', 'self_role_change');
  const users = database().collection('users');
  const previous = await users.findOne({ _id: id });
  if (!previous) throw new HttpError(404, 'Usuario no encontrado', 'user_not_found');
  if (previous.role === role) return res.json({ user: publicUser(previous), changed: false });
  const changedAt = new Date();
  const updated = await users.findOneAndUpdate(
    { _id: id, role: previous.role, tokenVersion: previous.tokenVersion },
    { $set: { role, updatedAt: changedAt }, $inc: { tokenVersion: 1 }, $push: {
      roleHistory: { at: changedAt, by: req.user._id, previousRole: previous.role, newRole: role },
    } },
    { returnDocument: 'after' },
  );
  if (!updated) throw new HttpError(409, 'El rol cambió durante la operación; vuelve a intentarlo', 'role_conflict');
  await database().collection('role_audit').insertOne({
    targetUserId: id, actorUserId: req.user._id,
    previousRole: previous.role, newRole: role, createdAt: changedAt,
  });
  res.json({ user: publicUser(updated), changed: true });
}));

app.get('/api/audit/roles', authenticate, requireRole('AUDITOR', 'ADMIN'), asyncRoute(async (req, res) => {
  const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
  const limit = 25;
  const filter = {};
  if (req.query.userId) filter.targetUserId = userId(String(req.query.userId));
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = dateOrNull(req.query.from, 'Desde');
    if (req.query.to) filter.createdAt.$lte = dateOrNull(req.query.to, 'Hasta');
  }
  const collection = database().collection('role_audit');
  const [total, items] = await Promise.all([
    collection.countDocuments(filter),
    collection.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
  ]);
  res.json({ page, limit, total, items: items.map(item => ({
    id: String(item._id), targetUserId: String(item.targetUserId), actorUserId: String(item.actorUserId),
    previousRole: item.previousRole, newRole: item.newRole, createdAt: item.createdAt,
  })) });
}));

app.post('/api/medical-passes', authenticate, activeMembership, asyncRoute(async (req, res) => {
  const pass = await createPass(req.user);
  res.status(201).json({ pass });
}));

app.post('/api/clinic/passes/validate', authenticate, requireRole('RECEPCION_CLINICA'), asyncRoute(async (req, res) => {
  if (!req.user.clinicId) throw new HttpError(403, 'Tu cuenta no está asociada con una clínica', 'clinic_required');
  const result = await validatePass(req.body || {}, req.user);
  res.json({ status: 'apto_para_atencion', validation: result });
}));

app.get('/api/clinic/passes/history', authenticate, requireRole('ADMIN_CLINICA'), asyncRoute(async (req, res) => {
  if (!req.user.clinicId) throw new HttpError(403, 'Tu cuenta no está asociada con una clínica', 'clinic_required');
  const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
  const from = dateOrNull(req.query.from, 'Desde');
  const to = dateOrNull(req.query.to, 'Hasta');
  res.json(await history({ clinicId: req.user.clinicId, from, to, page }));
}));

app.use(express.static(path.join(__dirname, '..', 'Web')));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next(new HttpError(404, 'Ruta no encontrada', 'not_found'));
  res.sendFile(path.join(__dirname, '..', 'Web', 'index.html'));
});
app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'JSON inválido', code: 'invalid_json' });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor', code: 'internal_error' });
});

if (require.main === module) {
  connect().then(() => {
    const server = app.listen(config.port, () => console.log(`PikaFit disponible en http://localhost:${config.port}`));
    const shutdown = async () => { server.close(); await close(); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }).catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { app };

