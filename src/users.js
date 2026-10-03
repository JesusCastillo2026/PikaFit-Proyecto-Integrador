const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const { database } = require('./db');
const { HttpError, text, dateOrNull } = require('./http');

const ROLES = Object.freeze([
  'SOCIO', 'ADMIN', 'ADMIN_B2B', 'MEDICO', 'COACH',
  'RECEPCION_CLINICA', 'ADMIN_CLINICA', 'AUDITOR',
]);

function normalizeEmail(value) {
  const email = text(value, 'correo', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Correo inválido', 'invalid_email');
  return email;
}

function normalizeDni(value) {
  if (value == null || value === '') return undefined;
  const dni = text(value, 'DNI', 12);
  if (!/^\d{8}$/.test(dni)) throw new HttpError(400, 'El DNI debe tener 8 dígitos', 'invalid_dni');
  return dni;
}

function publicUser(user) {
  return {
    id: String(user._id), name: user.name, email: user.email, dni: user.dni,
    role: user.role, clinicId: user.clinicId || null,
    membershipExpiresAt: user.membershipExpiresAt || null,
    membershipActive: user.role === 'SOCIO' ? Boolean(user.membershipExpiresAt && new Date(user.membershipExpiresAt) > new Date()) : null,
  };
}

async function createUser(input) {
  const name = text(input.name, 'nombre', 150);
  const email = normalizeEmail(input.email);
  const dni = normalizeDni(input.dni);
  const password = text(input.password, 'contraseña', 200);
  if (password.length < 12) throw new HttpError(400, 'La contraseña debe tener al menos 12 caracteres', 'weak_password');
  const role = input.role || 'SOCIO';
  if (!ROLES.includes(role)) throw new HttpError(400, 'Rol inválido', 'invalid_role');
  const clinicId = input.clinicId ? text(input.clinicId, 'clínica', 80) : null;
  if (['RECEPCION_CLINICA', 'ADMIN_CLINICA'].includes(role) && !clinicId) {
    throw new HttpError(400, 'El personal de clínica debe tener una clínica asociada', 'clinic_required');
  }
  const membershipExpiresAt = dateOrNull(input.membershipExpiresAt, 'Vencimiento de membresía');
  const document = {
    name, email, ...(dni ? { dni } : {}), role,
    passwordHash: await bcrypt.hash(password, 12),
    membershipExpiresAt, clinicId,
    failedAttempts: 0, lockedUntil: null, tokenVersion: 0,
    createdAt: new Date(), updatedAt: new Date(),
  };
  try {
    const result = await database().collection('users').insertOne(document);
    return publicUser({ ...document, _id: result.insertedId });
  } catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'El correo o DNI ya está registrado', 'duplicate_user');
    throw error;
  }
}

function userId(value) {
  if (!ObjectId.isValid(value)) throw new HttpError(400, 'Identificador de usuario inválido', 'invalid_id');
  return new ObjectId(value);
}

module.exports = { ROLES, normalizeEmail, normalizeDni, publicUser, createUser, userId };
