const { ObjectId } = require('mongodb');
const { randomUUID } = require('node:crypto');
const { mkdir, writeFile, readFile, unlink } = require('node:fs/promises');
const path = require('node:path');
const { database } = require('./db');
const { HttpError, text } = require('./http');
const { isExerciseAllowed, selectAvailableExercise } = require('./training-domain');

const FATIGUE_LEVELS = Object.freeze(['BAJA', 'MEDIA', 'ALTA']);
const MEDIA_TYPES = Object.freeze(['video/mp4', 'video/webm']);
const NUTRITION_GUIDES = Object.freeze([
  { goal: 'energia', title: 'Energía para entrenar', sections: ['Incluye alimentos variados en tus comidas.', 'Elige una comida que toleres bien antes de entrenar.', 'Mantén agua disponible durante el día.'] },
  { goal: 'recuperacion', title: 'Hábitos para la recuperación', sections: ['Procura una alimentación variada a lo largo del día.', 'Incluye fuentes de proteína y alimentos vegetales según tus preferencias.', 'El descanso y la hidratación también forman parte de la recuperación.'] },
  { goal: 'bienestar', title: 'Alimentación equilibrada', sections: ['Combina frutas o verduras, cereales o tubérculos y fuentes de proteína.', 'Prioriza hábitos sostenibles que se adapten a tus preferencias.', 'Esta guía es informativa y no reemplaza la orientación de un profesional de nutrición.'] },
]);

function objectId(value, label) {
  if (!ObjectId.isValid(value)) throw new HttpError(400, `${label} inválido`, 'invalid_id');
  return new ObjectId(value);
}

function normalizeFatigueLevel(value) {
  if (!FATIGUE_LEVELS.includes(value)) throw new HttpError(400, 'El nivel de fatiga debe ser BAJA, MEDIA o ALTA', 'invalid_fatigue_level');
  return value;
}

function fatigueReduction(level, configuredPercent = 20) {
  normalizeFatigueLevel(level);
  const high = Number(configuredPercent);
  if (!Number.isFinite(high) || high < 1 || high > 50) throw new HttpError(500, 'FATIGUE_HIGH_REDUCTION_PERCENT debe estar entre 1 y 50', 'invalid_fatigue_configuration');
  return level === 'ALTA' ? high : level === 'MEDIA' ? Math.round(high / 2) : 0;
}

function normalizeRpe(value) {
  const rpe = Number(value);
  if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) throw new HttpError(400, 'El RPE debe ser un número entero del 1 al 10', 'invalid_rpe');
  return rpe;
}

function applyReduction(exercises, percent) {
  return exercises.map(exercise => ({
    ...exercise,
    sets: Math.max(1, Math.round(Number(exercise.sets || 1) * (1 - percent / 100))),
    reps: Math.max(1, Math.round(Number(exercise.reps || 1) * (1 - percent / 100))),
  }));
}

async function reportFatigue(memberId, routineId, rawLevel, configuredPercent) {
  const member = objectId(memberId, 'Socio');
  const routine = objectId(routineId, 'Rutina');
  const level = normalizeFatigueLevel(rawLevel);
  const reductionPercent = fatigueReduction(level, configuredPercent);
  const routines = database().collection('routines');
  const current = await routines.findOne({ _id: routine, memberId: member });
  if (!current) throw new HttpError(404, 'Rutina no encontrada', 'routine_not_found');
  const now = new Date();
  const adaptedExercises = applyReduction(current.exercises, reductionPercent);
  await routines.updateOne({ _id: routine, memberId: member }, {
    $set: { exercises: adaptedExercises, updatedAt: now },
    $push: { adaptationHistory: { type: 'fatigue', level, reductionPercent, createdAt: now } },
  });
  await database().collection('fatigue_reports').insertOne({ memberId: member, routineId: routine, level, reductionPercent, createdAt: now });
  return { routineId: String(routine), level, reductionPercent, exercises: adaptedExercises, adaptedAt: now };
}

async function reportDiscomfort(memberId, sessionId, input) {
  const member = objectId(memberId, 'Socio');
  const session = objectId(sessionId, 'Sesión');
  const exerciseId = text(input.exerciseId, 'ejercicio', 80);
  const zone = text(input.zone, 'zona de molestia', 80).toLowerCase();
  const sessions = database().collection('workout_sessions');
  const active = await sessions.findOne({ _id: session, memberId: member, endedAt: null });
  if (!active) throw new HttpError(404, 'Sesión activa no encontrada', 'session_not_found');
  const currentExercise = active.exercises.find(item => String(item.exerciseId) === exerciseId);
  if (!currentExercise) throw new HttpError(400, 'El ejercicio no pertenece a esta sesión', 'exercise_not_in_session');

  const [evaluation, machines, catalog] = await Promise.all([
    database().collection('medical_evaluations').findOne({ memberId: member, result: 'APROBADO' }, { sort: { createdAt: -1 } }),
    database().collection('machines').find({ siteId: active.siteId, state: 'DISPONIBLE' }).toArray(),
    database().collection('exercises').find({ active: true, _id: { $ne: objectId(exerciseId, 'Ejercicio') } }).toArray(),
  ]);
  const restrictions = evaluation?.restrictions || [];
  const candidates = catalog.filter(item => String(item._id) !== exerciseId && isExerciseAllowed(item, [...restrictions, { zone, movements: [] }]));
  let substitute = null;
  for (const candidate of candidates) {
    const selected = selectAvailableExercise(candidate, machines);
    if (candidate.machineId && !selected) continue;
    substitute = {
      exerciseId: String(candidate._id), name: selected?.name || candidate.name,
      sets: currentExercise.sets || candidate.defaultSets, reps: currentExercise.reps || candidate.defaultReps,
      restSeconds: currentExercise.restSeconds ?? candidate.restSeconds,
      equipment: selected?.equipment || null, substituted: true,
    };
    break;
  }
  const report = {
    memberId: member, sessionId: session, exerciseId, zone,
    originalExerciseName: currentExercise.name, safeSubstitutionAvailable: Boolean(substitute),
    substituteExerciseId: substitute?.exerciseId || null, createdAt: new Date(),
  };
  await database().collection('discomfort_reports').insertOne(report);
  if (!substitute) {
    await sessions.updateOne({ _id: session, memberId: member, endedAt: null }, { $set: { requiresCoachReview: true, blockedExerciseId: exerciseId } });
    return { safeSubstitutionAvailable: false, requiresCoachReview: true, message: 'Detén este ejercicio y solicita apoyo del coach; no encontramos una alternativa validada.' };
  }
  const exercises = active.exercises.map(item => String(item.exerciseId) === exerciseId ? substitute : item);
  await sessions.updateOne({ _id: session, memberId: member, endedAt: null }, { $set: { exercises, updatedAt: new Date() } });
  return { safeSubstitutionAvailable: true, requiresCoachReview: false, exercise: substitute };
}

function normalizeMediaMetadata(input, maxBytes) {
  const contentType = text(input.contentType, 'tipo de video', 80).toLowerCase();
  if (!MEDIA_TYPES.includes(contentType)) throw new HttpError(400, 'Formato no permitido. Usa MP4 o WebM.', 'invalid_media_type');
  const sizeBytes = Number(input.sizeBytes);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > maxBytes) throw new HttpError(400, `El video debe pesar entre 1 byte y ${maxBytes} bytes`, 'invalid_media_size');
  return { title: text(input.title, 'título', 120), contentType, sizeBytes };
}

async function createExerciseMedia(actor, exerciseId, input, maxBytes) {
  const metadata = normalizeMediaMetadata(input, maxBytes);
  const id = objectId(exerciseId, 'Ejercicio');
  const exercise = await database().collection('exercises').findOne({ _id: id, active: true });
  if (!exercise) throw new HttpError(404, 'Ejercicio no encontrado', 'exercise_not_found');
  const now = new Date();
  const doc = { ...metadata, exerciseId: id, storageKey: randomUUID(), active: false, createdBy: actor._id, createdAt: now, updatedAt: now };
  const result = await database().collection('exercise_media').insertOne(doc);
  return { id: String(result.insertedId), title: doc.title, contentType: doc.contentType, sizeBytes: doc.sizeBytes, active: false };
}

function mediaFilePath(storageKey) {
  if (!/^[0-9a-f-]{36}$/i.test(storageKey)) throw new HttpError(400, 'Recurso multimedia inválido', 'invalid_media_id');
  return path.join(process.cwd(), 'storage', 'exercise-videos', `${storageKey}.video`);
}

async function saveExerciseMedia(mediaId, buffer, maxBytes) {
  const id = objectId(mediaId, 'Recurso multimedia');
  const media = await database().collection('exercise_media').findOne({ _id: id });
  if (!media) throw new HttpError(404, 'Recurso multimedia no encontrado', 'media_not_found');
  if (!Buffer.isBuffer(buffer) || buffer.length < 1 || buffer.length > maxBytes || buffer.length > media.sizeBytes) throw new HttpError(413, 'El tamaño del video supera el límite permitido o no coincide con el declarado', 'media_size_mismatch');
  const file = mediaFilePath(media.storageKey);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buffer, { flag: 'w' });
  await database().collection('exercise_media').updateOne({ _id: id }, { $set: { active: true, actualSizeBytes: buffer.length, updatedAt: new Date() } });
  return { id: String(id), active: true, sizeBytes: buffer.length };
}

async function listExerciseMedia(exerciseId) {
  const id = objectId(exerciseId, 'Ejercicio');
  const items = await database().collection('exercise_media').find({ exerciseId: id, active: true }).sort({ createdAt: -1 }).toArray();
  return items.map(item => ({ id: String(item._id), title: item.title, contentType: item.contentType, sizeBytes: item.actualSizeBytes || item.sizeBytes }));
}

async function getExerciseMedia(mediaId) {
  const id = objectId(mediaId, 'Recurso multimedia');
  const media = await database().collection('exercise_media').findOne({ _id: id, active: true });
  if (!media) throw new HttpError(404, 'Video no disponible', 'media_not_found');
  try { return { media, buffer: await readFile(mediaFilePath(media.storageKey)) }; }
  catch { throw new HttpError(404, 'Archivo de video no encontrado', 'media_file_not_found'); }
}

async function setExerciseMediaActive(mediaId, active) {
  if (typeof active !== 'boolean') throw new HttpError(400, 'Indica si el video debe estar activo', 'invalid_media_state');
  const id = objectId(mediaId, 'Recurso multimedia');
  const result = await database().collection('exercise_media').updateOne({ _id: id }, { $set: { active, updatedAt: new Date() } });
  if (!result.matchedCount) throw new HttpError(404, 'Recurso multimedia no encontrado', 'media_not_found');
  return { id: String(id), active };
}

async function assignCoachMember(coachId, memberId) {
  const coach = objectId(coachId, 'Coach');
  const member = objectId(memberId, 'Socio');
  const users = database().collection('users');
  const [coachUser, memberUser] = await Promise.all([
    users.findOne({ _id: coach, role: 'COACH' }, { projection: { _id: 1 } }),
    users.findOne({ _id: member, role: 'SOCIO' }, { projection: { _id: 1 } }),
  ]);
  if (!coachUser || !memberUser) throw new HttpError(404, 'Coach o socio no encontrado', 'coach_member_not_found');
  await database().collection('coach_members').updateOne({ coachId: coach, memberId: member }, { $setOnInsert: { coachId: coach, memberId: member, createdAt: new Date() } }, { upsert: true });
  return { coachId: String(coach), memberId: String(member), assigned: true };
}

async function coachDashboard(coachId) {
  const coach = objectId(coachId, 'Coach');
  const links = await database().collection('coach_members').find({ coachId: coach }).toArray();
  const memberIds = links.map(link => link.memberId);
  if (!memberIds.length) return { items: [] };
  const [members, sessions] = await Promise.all([
    database().collection('users').find({ _id: { $in: memberIds }, role: 'SOCIO' }, { projection: { name: 1 } }).toArray(),
    database().collection('workout_sessions').find({ memberId: { $in: memberIds }, endedAt: { $ne: null }, rpe: { $gte: 1, $lte: 10 } }).sort({ endedAt: -1 }).limit(500).toArray(),
  ]);
  const byMember = new Map();
  for (const session of sessions) {
    const key = String(session.memberId);
    const list = byMember.get(key) || [];
    if (list.length < 5) list.push(session);
    byMember.set(key, list);
  }
  return { items: members.map(member => {
    const recent = byMember.get(String(member._id)) || [];
    const averageRpe = recent.length ? Number((recent.reduce((sum, row) => sum + row.rpe, 0) / recent.length).toFixed(1)) : null;
    return { memberId: String(member._id), memberName: member.name, sessions: recent.map(row => ({ id: String(row._id), rpe: row.rpe, endedAt: row.endedAt })), averageRpe, alert: recent.length >= 3 && recent.slice(0, 3).every(row => row.rpe >= 8) };
  }) };
}

async function ensureNutritionGuides() {
  const collection = database().collection('nutrition_guides');
  for (const guide of NUTRITION_GUIDES) await collection.updateOne({ goal: guide.goal }, { $setOnInsert: { ...guide, informational: true, active: true, createdAt: new Date() } }, { upsert: true });
}

async function listNutritionGuides(goal) {
  const filter = { active: true };
  if (goal) filter.goal = text(goal, 'objetivo', 40).toLowerCase();
  const items = await database().collection('nutrition_guides').find(filter).sort({ title: 1 }).toArray();
  return items.map(({ _id, goal: key, title, sections, informational }) => ({ id: String(_id), goal: key, title, sections, informational }));
}

module.exports = {
  FATIGUE_LEVELS, MEDIA_TYPES, NUTRITION_GUIDES, normalizeFatigueLevel, fatigueReduction, normalizeRpe, applyReduction,
  reportFatigue, reportDiscomfort, normalizeMediaMetadata, createExerciseMedia, saveExerciseMedia,
  listExerciseMedia, getExerciseMedia, setExerciseMediaActive, mediaFilePath,
  assignCoachMember, coachDashboard, ensureNutritionGuides, listNutritionGuides,
};
