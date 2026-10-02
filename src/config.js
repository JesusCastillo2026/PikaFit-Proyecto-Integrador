require('dotenv').config();

function positiveInteger(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} debe ser un entero positivo`);
  return value;
}

function requiredSecret(name) {
  const value = process.env[name] || '';
  if (value.length < 32) throw new Error(`${name} debe tener al menos 32 caracteres`);
  return value;
}

module.exports = {
  port: positiveInteger('PORT', 3000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  mongoDb: process.env.MONGODB_DB || 'pikafit_jesus',
  jwtSecret: requiredSecret('JWT_SECRET'),
  passSecret: requiredSecret('PASS_SECRET'),
  lockMaxAttempts: positiveInteger('LOCK_MAX_ATTEMPTS', 5),
  lockMinutes: positiveInteger('LOCK_MINUTES', 15),
  passMinutes: positiveInteger('PASS_MINUTES', 10),
};

