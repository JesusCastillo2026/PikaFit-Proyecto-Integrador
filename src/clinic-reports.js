const { database } = require('./db');
const { HttpError } = require('./http');

function positiveDays(value, fallback = 30) {
  const days = value == null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new HttpError(400, 'El período debe estar entre 1 y 90 días', 'invalid_period');
  }
  return days;
}

async function expiringMemberships({ clinicId, days, now = new Date() }) {
  const period = positiveDays(days);
  const until = new Date(now.getTime() + period * 24 * 60 * 60 * 1000);
  const users = await database().collection('users').find({
    role: 'SOCIO', clinicId, membershipExpiresAt: { $gt: now, $lte: until },
  }).project({ name: 1, email: 1, dni: 1, membershipExpiresAt: 1 })
    .sort({ membershipExpiresAt: 1, name: 1 }).limit(500).toArray();
  return {
    periodDays: period,
    items: users.map(user => ({
      id: String(user._id), name: user.name, email: user.email, dni: user.dni || null,
      membershipExpiresAt: user.membershipExpiresAt,
      daysRemaining: Math.max(1, Math.ceil((user.membershipExpiresAt - now) / (24 * 60 * 60 * 1000))),
      membershipState: 'Vigente, próxima a vencer',
    })),
  };
}

function monthWindow(value) {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new HttpError(400, 'Indica el mes con el formato AAAA-MM', 'invalid_month');
  }
  const [year, month] = value.split('-').map(Number);
  // La clínica opera en Perú (UTC-05); el período mensual sigue su calendario local.
  return {
    from: new Date(Date.UTC(year, month - 1, 1, 5)),
    to: new Date(Date.UTC(year, month, 1, 5)),
  };
}

async function monthlyClinicSummary({ clinicId, month }) {
  const { from, to } = monthWindow(month);
  const [evaluations, validatedPasses] = await Promise.all([
    database().collection('medical_evaluations').countDocuments({ clinicId, createdAt: { $gte: from, $lt: to } }),
    database().collection('medical_passes').countDocuments({ clinicId, usedAt: { $gte: from, $lt: to } }),
  ]);
  return { month, evaluations, validatedPasses, totalActivity: evaluations + validatedPasses };
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function summaryCsv(summary) {
  return [
    ['Mes', 'Evaluaciones médicas', 'Pases validados', 'Actividad total'],
    [summary.month, summary.evaluations, summary.validatedPasses, summary.totalActivity],
  ].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

module.exports = { positiveDays, expiringMemberships, monthWindow, monthlyClinicSummary, summaryCsv };
