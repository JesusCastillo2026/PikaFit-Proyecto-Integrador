const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { database } = require('./db');
const config = require('./config');
const { HttpError, asyncRoute } = require('./http');
const { normalizeEmail, normalizeDni, publicUser, userId } = require('./users');

const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeOQ9VuvCGprw7nC1S7b50f2sMBx1oPGhe';

async function login({ email, dni, password }) {
  // El DNI identifica la cuenta, pero se exige la contraseña para no usar un dato público como secreto.
  if (Boolean(email) === Boolean(dni)) throw new HttpError(400, 'Indica correo o DNI', 'invalid_login');
  if (typeof password !== 'string' || !password) throw new HttpError(400, 'Indica la contraseña', 'invalid_login');
  const selector = email ? { email: normalizeEmail(email) } : { dni: normalizeDni(dni) };
  const users = database().collection('users');
  const user = await users.findOne(selector);
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw new HttpError(401, 'Credenciales incorrectas', 'invalid_credentials');
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new HttpError(423, 'Cuenta bloqueada temporalmente', 'account_locked');
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const failedAttempts = (user.failedAttempts || 0) + 1;
    const lock = failedAttempts >= config.lockMaxAttempts;
    await users.updateOne({ _id: user._id }, { $set: {
      failedAttempts: lock ? 0 : failedAttempts,
      lockedUntil: lock ? new Date(Date.now() + config.lockMinutes * 60_000) : null,
      updatedAt: new Date(),
    }});
    throw new HttpError(lock ? 423 : 401, lock ? 'Cuenta bloqueada temporalmente' : 'Credenciales incorrectas', lock ? 'account_locked' : 'invalid_credentials');
  }
  await users.updateOne({ _id: user._id }, { $set: { failedAttempts: 0, lockedUntil: null, updatedAt: new Date() } });
  const token = jwt.sign({ ver: user.tokenVersion || 0 }, config.jwtSecret, {
    subject: String(user._id), issuer: 'pikafit-jesus', audience: 'pikafit-client', expiresIn: '8h',
  });
  return { token, user: publicUser(user) };
}

const authenticate = asyncRoute(async (req, _res, next) => {
  const match = /^Bearer (.+)$/i.exec(req.headers.authorization || '');
  if (!match) throw new HttpError(401, 'Debes iniciar sesión', 'unauthorized');
  let payload;
  try {
    payload = jwt.verify(match[1], config.jwtSecret, { issuer: 'pikafit-jesus', audience: 'pikafit-client' });
  } catch {
    throw new HttpError(401, 'Sesión inválida o vencida', 'invalid_token');
  }
  const user = await database().collection('users').findOne({ _id: userId(payload.sub) });
  if (!user || (user.tokenVersion || 0) !== payload.ver) {
    throw new HttpError(401, 'La sesión fue revocada', 'session_revoked');
  }
  req.user = user;
  next();
});

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.user?.role)) return next(new HttpError(403, 'No tienes permiso para esta función', 'forbidden'));
    next();
  };
}

function activeMembership(req, _res, next) {
  if (req.user.role !== 'SOCIO') return next(new HttpError(403, 'Función exclusiva de socios', 'forbidden'));
  if (!req.user.membershipExpiresAt || new Date(req.user.membershipExpiresAt) <= new Date()) {
    return next(new HttpError(403, 'Tu membresía está vencida. Debes renovarla para continuar.', 'membership_expired'));
  }
  next();
}

module.exports = { login, authenticate, requireRole, activeMembership };

