const { ObjectId } = require('mongodb');
const { database } = require('./db');
const { HttpError } = require('./http');
const { normalizeWorkoutSet } = require('./training-domain');

function asId(value, label) {
  if (!ObjectId.isValid(value)) throw new HttpError(400, `${label} inválido`, 'invalid_id');
  return new ObjectId(value);
}

async function startSession(memberId, routineId) {
  const member = asId(memberId, 'Socio');
  const routine = await database().collection('routines').findOne({ _id: asId(routineId, 'Rutina'), memberId: member });
  if (!routine) throw new HttpError(404, 'Rutina no encontrada', 'routine_not_found');
  const active = await database().collection('workout_sessions').findOne({ memberId: member, endedAt: null });
  if (active) throw new HttpError(409, 'Ya tienes una sesión en curso', 'session_already_active');
  const createdAt = new Date();
  const session = { memberId: member, routineId: routine._id, siteId: routine.siteId || null, exercises: routine.exercises, sets: [], createdAt, endedAt: null };
  const result = await database().collection('workout_sessions').insertOne(session);
  return { id: String(result.insertedId), createdAt, exercises: routine.exercises, sets: [] };
}

async function recordSet(memberId, sessionId, input) {
  const member = asId(memberId, 'Socio');
  const id = asId(sessionId, 'Sesión');
  const set = normalizeWorkoutSet(input);
  if (input.rpe != null) set.rpe = require('./sprint3').normalizeRpe(input.rpe);
  const exerciseId = String(input.exerciseId || '');
  if (!exerciseId) throw new HttpError(400, 'Debes seleccionar un ejercicio de la rutina', 'exercise_required');
  const sessions = database().collection('workout_sessions');
  const session = await sessions.findOne({ _id: id, memberId: member, endedAt: null });
  if (!session) throw new HttpError(404, 'Sesión activa no encontrada', 'session_not_found');
  if (!session.exercises.some(item => String(item.exerciseId) === exerciseId)) throw new HttpError(400, 'El ejercicio no pertenece a esta sesión', 'exercise_not_in_session');
  const exists = session.sets.some(item => item.exerciseId === exerciseId && item.setNumber === set.setNumber);
  if (exists) throw new HttpError(409, 'La serie ya fue registrada', 'duplicate_set');
  const entry = { exerciseId, ...set, recordedAt: new Date() };
  await sessions.updateOne({ _id: id, memberId: member, endedAt: null }, { $push: { sets: entry } });
  return entry;
}

async function finishSession(memberId, sessionId, rpe) {
  if (rpe != null) require('./sprint3').normalizeRpe(rpe);
  const result = await database().collection('workout_sessions').findOneAndUpdate(
    { _id: asId(sessionId, 'Sesión'), memberId: asId(memberId, 'Socio'), endedAt: null },
    { $set: { endedAt: new Date(), ...(rpe == null ? {} : { rpe: Number(rpe) }) } }, { returnDocument: 'after' },
  );
  if (!result) throw new HttpError(404, 'Sesión activa no encontrada', 'session_not_found');
  return { id: String(result._id), createdAt: result.createdAt, endedAt: result.endedAt, sets: result.sets };
}

async function activeSession(memberId) {
  const session = await database().collection('workout_sessions').findOne({ memberId: asId(memberId, 'Socio'), endedAt: null });
  return session ? { id: String(session._id), routineId: String(session.routineId), exercises: session.exercises, createdAt: session.createdAt, sets: session.sets } : null;
}

async function sessionHistory(memberId) {
  const items = await database().collection('workout_sessions').find({ memberId: asId(memberId, 'Socio') })
    .sort({ createdAt: -1 }).limit(50).toArray();
  return items.map(item => ({ id: String(item._id), routineId: String(item.routineId), createdAt: item.createdAt, endedAt: item.endedAt, setCount: item.sets.length }));
}

module.exports = { startSession, recordSet, finishSession, sessionHistory, activeSession };
