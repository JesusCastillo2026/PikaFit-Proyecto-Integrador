const { ObjectId } = require('mongodb');
const { randomBytes } = require('node:crypto');
const QRCode = require('qrcode');
const { database } = require('./db');
const { HttpError, text } = require('./http');
const { encryptClinicalText, decryptClinicalText } = require('./clinical-crypto');
const { normalizeSite, normalizeMachine, validateMachine, normalizeEvaluation, normalizeExercise, buildSafeRoutine } = require('./training-domain');
const config = require('./config');

function objectId(value, label = 'identificador') {
  if (!ObjectId.isValid(value)) throw new HttpError(400, `${label} inválido`, 'invalid_id');
  return new ObjectId(value);
}

async function createSite(input) {
  const site = normalizeSite(input);
  const result = await database().collection('sites').insertOne({ ...site, createdAt: new Date(), updatedAt: new Date() });
  return { id: String(result.insertedId), ...site };
}

async function listSites() {
  const sites = await database().collection('sites').find({ active: true }).sort({ name: 1 }).toArray();
  return sites.map(site => ({ id: String(site._id), name: site.name, address: site.address }));
}

async function createMachine(siteId, input) {
  const id = objectId(siteId, 'Sede');
  const site = await database().collection('sites').findOne({ _id: id, active: true });
  if (!site) throw new HttpError(404, 'Sede no encontrada', 'site_not_found');
  const machine = validateMachine(normalizeMachine({ ...input, siteId: String(id) }));
  const qrToken = randomBytes(24).toString('base64url');
  const doc = { ...machine, siteId: id, qrToken, createdAt: new Date(), updatedAt: new Date() };
  try {
    const result = await database().collection('machines').insertOne(doc);
    return publicMachine({ ...doc, _id: result.insertedId });
  } catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'El código o número de serie ya está registrado', 'duplicate_machine');
    throw error;
  }
}

function publicMachine(machine) {
  return {
    id: String(machine._id), code: machine.code, serialNumber: machine.serialNumber,
    name: machine.name, muscleGroup: machine.muscleGroup, siteId: String(machine.siteId),
    state: machine.state, riskZones: machine.riskZones, alternatives: machine.alternatives,
    photoUrl: machine.photoUrl,
  };
}

async function listMachines(siteId, { availableOnly = false } = {}) {
  const filter = { siteId: objectId(siteId, 'Sede') };
  if (availableOnly) filter.state = 'DISPONIBLE';
  const machines = await database().collection('machines').find(filter).sort({ muscleGroup: 1, name: 1 }).toArray();
  return machines.map(publicMachine);
}

async function setMachineState(machineId, state) {
  const id = objectId(machineId, 'Máquina');
  const { MACHINE_STATES } = require('./training-domain');
  if (!MACHINE_STATES.includes(state)) throw new HttpError(400, 'Estado de máquina inválido', 'invalid_machine_state');
  const machines = database().collection('machines');
  const changedAt = new Date();
  const result = await machines.findOneAndUpdate({ _id: id }, {
    $set: { state, updatedAt: changedAt },
    $push: { stateHistory: { state, changedAt } },
  }, { returnDocument: 'after' });
  if (!result) throw new HttpError(404, 'Máquina no encontrada', 'machine_not_found');
  return publicMachine(result);
}

async function machineStateHistory(machineId) {
  const machine = await database().collection('machines').findOne(
    { _id: objectId(machineId, 'Máquina') },
    { projection: { code: 1, name: 1, stateHistory: 1 } },
  );
  if (!machine) throw new HttpError(404, 'Máquina no encontrada', 'machine_not_found');
  return {
    machine: { id: String(machine._id), code: machine.code, name: machine.name },
    items: [...(machine.stateHistory || [])].reverse().slice(0, 100),
  };
}

async function saveEvaluation(actor, input) {
  const data = normalizeEvaluation(input);
  const memberId = objectId(input.memberId, 'Socio');
  const member = await database().collection('users').findOne({ _id: memberId, role: 'SOCIO' });
  if (!member) throw new HttpError(404, 'Socio no encontrado', 'member_not_found');
  if (!actor.clinicId || actor.clinicId !== member.clinicId) throw new HttpError(403, 'El socio no pertenece a tu clínica', 'clinic_forbidden');
  const createdAt = new Date();
  const document = {
    memberId, doctorId: actor._id, clinicId: actor.clinicId, result: data.result,
    restrictions: data.restrictions,
    diagnosis: encryptClinicalText(data.diagnosis),
    observations: encryptClinicalText(data.observations), createdAt,
  };
  const result = await database().collection('medical_evaluations').insertOne(document);
  await database().collection('users').updateOne({ _id: memberId }, {
    $set: { medicalStatus: data.result, medicalStatusUpdatedAt: createdAt },
  });
  const token = member.pushToken;
  const notice = {
    memberId, kind: 'medical_status', title: 'Estado de aptitud actualizado',
    message: data.result === 'APROBADO' ? 'Tu apto médico fue aprobado.' : 'Tu evaluación médica requiere seguimiento.',
    result: data.result, createdAt, readAt: null,
  };
  await database().collection('medical_notifications').insertOne(notice);
  if (token) await database().collection('push_outbox').insertOne({
    token, memberId, kind: 'medical_status', result: data.result,
    createdAt, status: 'pending',
  });
  return { id: String(result.insertedId), memberId: String(memberId), result: data.result, restrictions: data.restrictions, createdAt, notificationQueued: Boolean(token) };
}

async function medicalNotifications(memberId) {
  const items = await database().collection('medical_notifications')
    .find({ memberId }).sort({ createdAt: -1 }).limit(50).toArray();
  return items.map(item => ({
    id: String(item._id), kind: item.kind, title: item.title,
    message: item.message, result: item.result, createdAt: item.createdAt,
  }));
}

async function coachRestrictions(memberId) {
  const id = objectId(memberId, 'Socio');
  const member = await database().collection('users').findOne({ _id: id, role: 'SOCIO' }, { projection: { _id: 1, name: 1, clinicId: 1 } });
  if (!member) throw new HttpError(404, 'Socio no encontrado', 'member_not_found');
  const evaluation = await database().collection('medical_evaluations').findOne({ memberId: id, result: 'APROBADO' }, { sort: { createdAt: -1 }, projection: { restrictions: 1, createdAt: 1 } });
  return { member: { id: String(member._id), name: member.name }, restrictions: evaluation?.restrictions || [], evaluatedAt: evaluation?.createdAt || null };
}

async function medicalRecord(memberId, clinicId) {
  const id = objectId(memberId, 'Socio');
  const evaluations = await database().collection('medical_evaluations').find({ memberId: id, clinicId }).sort({ createdAt: -1 }).limit(50).toArray();
  return evaluations.map(item => ({
    id: String(item._id), result: item.result, restrictions: item.restrictions,
    diagnosis: decryptClinicalText(item.diagnosis), observations: decryptClinicalText(item.observations), createdAt: item.createdAt,
  }));
}

async function registerPushToken(userId, value) {
  const token = text(value, 'token push', 4096);
  await database().collection('users').updateOne({ _id: userId }, { $set: { pushToken: token, pushTokenUpdatedAt: new Date() } });
  return { registered: true };
}

async function machineQr(machineId) {
  const machine = await database().collection('machines').findOne({ _id: objectId(machineId, 'Máquina') });
  if (!machine) throw new HttpError(404, 'Máquina no encontrada', 'machine_not_found');
  return { qrDataUrl: await QRCode.toDataURL(`pikafit://machine/${machine.qrToken}`) };
}

async function createExercise(input) {
  const exercise = normalizeExercise(input);
  if (exercise.machineId) exercise.machineId = objectId(exercise.machineId, 'Máquina');
  const document = { ...exercise, createdAt: new Date(), updatedAt: new Date() };
  const result = await database().collection('exercises').insertOne(document);
  return { id: String(result.insertedId), ...exercise, machineId: exercise.machineId ? String(exercise.machineId) : null };
}

async function generateRoutine(member) {
  if (!config.routineEngineUrl) throw new HttpError(503, 'El motor de rutinas no está configurado', 'routine_engine_unavailable');
  if (!member.siteId) throw new HttpError(400, 'Tu cuenta no tiene una sede asignada', 'site_required');
  const evaluation = await database().collection('medical_evaluations').findOne(
    { memberId: member._id }, { sort: { createdAt: -1 } },
  );
  if (!evaluation || evaluation.result !== 'APROBADO') throw new HttpError(403, 'Necesitas un apto médico aprobado para generar una rutina', 'medical_clearance_required');
  const profile = {
    goals: Array.isArray(member.goals) ? member.goals.slice(0, 5) : [],
    level: member.trainingLevel || 'inicial',
    measurements: member.measurements || {},
    restrictions: evaluation.restrictions || [],
    siteId: String(member.siteId),
  };
  let response;
  try {
    response = await fetch(config.routineEngineUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(config.routineEngineToken ? { authorization: `Bearer ${config.routineEngineToken}` } : {}) },
      body: JSON.stringify({ profile }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    const timeout = error.name === 'TimeoutError';
    throw new HttpError(504, timeout ? 'El motor de rutinas tardó demasiado; intenta nuevamente' : 'No se pudo conectar con el motor de rutinas', timeout ? 'routine_engine_timeout' : 'routine_engine_error');
  }
  if (!response.ok) throw new HttpError(502, 'El motor de rutinas no pudo completar la solicitud', 'routine_engine_error');
  let generated;
  try { generated = await response.json(); } catch { throw new HttpError(502, 'El motor devolvió una respuesta inválida', 'routine_engine_invalid_response'); }
  if (!Array.isArray(generated.exercises) || generated.exercises.length < 1 || generated.exercises.length > 30) {
    throw new HttpError(502, 'El motor devolvió una rutina inválida', 'routine_engine_invalid_response');
  }
  let requestedIds;
  try {
    requestedIds = [...new Set(generated.exercises.map(item => String(item.exerciseId || '')))].map(id => objectId(id, 'Ejercicio'));
  } catch {
    throw new HttpError(502, 'El motor devolvió identificadores de ejercicio inválidos', 'routine_engine_invalid_response');
  }
  const catalog = await database().collection('exercises').find({ _id: { $in: requestedIds }, active: true }).toArray();
  const machines = await database().collection('machines').find({ siteId: objectId(member.siteId, 'Sede'), state: 'DISPONIBLE' }).toArray();
  const orderedCandidates = generated.exercises.map(item => catalog.find(candidate => String(candidate._id) === String(item.exerciseId))).filter(Boolean);
  const normalized = buildSafeRoutine(orderedCandidates, evaluation.restrictions || [], machines);
  if (!normalized.length) throw new HttpError(422, 'No hay ejercicios seguros disponibles para tu sede y restricciones', 'no_safe_exercises');
  const now = new Date();
  const routine = { memberId: member._id, siteId: objectId(member.siteId), exercises: normalized, createdAt: now, source: 'configured-engine' };
  const saved = await database().collection('routines').insertOne(routine);
  return { id: String(saved.insertedId), exercises: normalized, createdAt: now };
}

module.exports = {
  createSite, listSites, createMachine, listMachines, setMachineState,
  machineStateHistory,
  saveEvaluation, coachRestrictions, medicalRecord, registerPushToken, machineQr,
  medicalNotifications,
  createExercise, generateRoutine,
};
