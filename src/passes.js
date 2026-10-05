const crypto = require('node:crypto');
const QRCode = require('qrcode');
const { database } = require('./db');
const config = require('./config');
const { HttpError, text } = require('./http');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function digest(value) {
  return crypto.createHmac('sha256', config.passSecret).update(value).digest('hex');
}

function shortCode() {
  return Array.from({ length: 6 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
}

async function createPass(member) {
  const passes = database().collection('medical_passes');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.passMinutes * 60_000);
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = crypto.randomBytes(32).toString('base64url');
    const code = shortCode();
    const document = {
      tokenDigest: digest(token), codeDigest: digest(code), memberId: member._id,
      createdAt: now, expiresAt, retentionUntil: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
      usedAt: null, clinicId: null, validatedBy: null,
    };
    try {
      const result = await passes.insertOne(document);
      return {
        id: String(result.insertedId), code, token, expiresAt,
        qrDataUrl: await QRCode.toDataURL(token, { margin: 1, width: 256 }),
      };
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  throw new HttpError(503, 'No se pudo generar un código único; inténtalo de nuevo', 'pass_unavailable');
}

async function validatePass({ token, code }, receptionist) {
  if (Boolean(token) === Boolean(code)) throw new HttpError(400, 'Indica QR o código alternativo', 'invalid_pass_input');
  const selector = token
    ? { tokenDigest: digest(text(token, 'QR', 200)) }
    : { codeDigest: digest(text(code, 'código', 20).toUpperCase()) };
  const passes = database().collection('medical_passes');
  const existing = await passes.findOne(selector);
  if (!existing) throw new HttpError(404, 'Pase inexistente', 'pass_not_found');
  if (existing.usedAt) throw new HttpError(409, 'El pase ya fue utilizado', 'pass_used');
  if (existing.expiresAt <= new Date()) throw new HttpError(410, 'El pase venció', 'pass_expired');
  const usedAt = new Date();
  const result = await passes.findOneAndUpdate(
    { ...selector, usedAt: null, expiresAt: { $gt: usedAt } },
    { $set: { usedAt, clinicId: receptionist.clinicId, validatedBy: receptionist._id }, $unset: { retentionUntil: '' } },
    { returnDocument: 'after' },
  );
  if (!result) throw new HttpError(409, 'El pase dejó de estar disponible', 'pass_unavailable');
  return { id: String(result._id), memberId: String(result.memberId), validatedAt: result.usedAt, clinicId: result.clinicId };
}

async function history({ clinicId, from, to, page = 1, limit = 20 }) {
  const filter = { clinicId, usedAt: { $ne: null } };
  if (from || to) {
    filter.usedAt = {};
    if (from) filter.usedAt.$gte = from;
    if (to) filter.usedAt.$lte = to;
  }
  const passes = database().collection('medical_passes');
  const total = await passes.countDocuments(filter);
  const items = await passes.find(filter).sort({ usedAt: -1 }).skip((page - 1) * limit).limit(limit).toArray();
  const users = database().collection('users');
  const memberIds = [...new Set(items.map(item => String(item.memberId)))];
  const memberDocs = memberIds.length ? await users.find({ _id: { $in: memberIds.map(id => new (require('mongodb').ObjectId)(id)) } }).project({ name: 1, dni: 1 }).toArray() : [];
  const memberMap = new Map(memberDocs.map(u => [String(u._id), u]));
  return {
    page, limit, total,
    items: items.map(p => ({
      id: String(p._id), memberId: String(p.memberId),
      memberName: memberMap.get(String(p.memberId))?.name || 'Socio no disponible',
      memberDni: memberMap.get(String(p.memberId))?.dni || null,
      validatedAt: p.usedAt, clinicId: p.clinicId,
    })),
  };
}

module.exports = { createPass, validatePass, history };
