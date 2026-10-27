const { HttpError, text } = require('./http');

const MACHINE_STATES = Object.freeze(['DISPONIBLE', 'FUERA_DE_SERVICIO']);
const EVALUATION_RESULTS = Object.freeze(['APROBADO', 'RECHAZADO']);

function normalizeSite(input = {}) {
  return {
    name: text(input.name, 'nombre de sede', 120),
    address: text(input.address, 'dirección', 250),
    active: input.active !== false,
  };
}

function normalizeMachine(input = {}) {
  const code = text(input.code, 'código', 40).toUpperCase();
  const serialNumber = text(input.serialNumber, 'número de serie', 80).toUpperCase();
  const muscleGroup = text(input.muscleGroup, 'grupo muscular', 80);
  const siteId = text(input.siteId, 'sede', 80);
  const riskZones = Array.isArray(input.riskZones) ? [...new Set(input.riskZones.map(v => text(v, 'zona de riesgo', 60).toLowerCase()))] : [];
  return {
    code, serialNumber,
    name: text(input.name, 'nombre de máquina', 120),
    muscleGroup, siteId, riskZones,
    state: input.state || 'DISPONIBLE',
    photoUrl: input.photoUrl ? text(input.photoUrl, 'foto', 500) : null,
    alternatives: Array.isArray(input.alternatives) ? input.alternatives.map(v => text(v, 'alternativa', 120)) : [],
  };
}

function validateMachine(machine) {
  if (!MACHINE_STATES.includes(machine.state)) throw new HttpError(400, 'Estado de máquina inválido', 'invalid_machine_state');
  if (machine.photoUrl && !/^https?:\/\//i.test(machine.photoUrl)) throw new HttpError(400, 'La URL de la foto debe usar HTTP o HTTPS', 'invalid_photo_url');
  return machine;
}

function normalizeEvaluation(input = {}) {
  const result = input.result;
  if (!EVALUATION_RESULTS.includes(result)) throw new HttpError(400, 'El resultado debe ser APROBADO o RECHAZADO', 'invalid_evaluation_result');
  const restrictions = Array.isArray(input.restrictions) ? input.restrictions.map(item => ({
    zone: text(item.zone, 'zona restringida', 80).toLowerCase(),
    movements: Array.isArray(item.movements) ? [...new Set(item.movements.map(value => text(value, 'movimiento', 80).toLowerCase()))] : [],
  })) : [];
  const diagnosis = typeof input.diagnosis === 'string' ? input.diagnosis.trim() : '';
  const observations = typeof input.observations === 'string' ? input.observations.trim() : '';
  if (diagnosis.length > 5000 || observations.length > 5000) throw new HttpError(400, 'El texto clínico supera el límite permitido', 'clinical_text_too_long');
  return { result, restrictions, diagnosis, observations };
}

function isExerciseAllowed(exercise, restrictions) {
  const riskyZones = new Set((exercise.riskZones || []).map(v => String(v).toLowerCase()));
  const riskyMovements = new Set((exercise.movements || []).map(v => String(v).toLowerCase()));
  return !restrictions.some(item => riskyZones.has(item.zone) && (!item.movements.length || item.movements.some(move => riskyMovements.has(move))));
}

function normalizeExercise(input = {}) {
  const riskZones = Array.isArray(input.riskZones) ? [...new Set(input.riskZones.map(v => text(v, 'zona de riesgo', 60).toLowerCase()))] : [];
  const movements = Array.isArray(input.movements) ? [...new Set(input.movements.map(v => text(v, 'movimiento', 60).toLowerCase()))] : [];
  const alternatives = Array.isArray(input.alternatives) ? [...new Set(input.alternatives.map(v => text(v, 'alternativa', 120)))] : [];
  const series = Number(input.defaultSets ?? 3);
  const repetitions = Number(input.defaultReps ?? 10);
  const restSeconds = Number(input.restSeconds ?? 60);
  if (!Number.isInteger(series) || series < 1 || series > 10) throw new HttpError(400, 'Las series deben estar entre 1 y 10', 'invalid_exercise_sets');
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) throw new HttpError(400, 'Las repeticiones deben estar entre 1 y 100', 'invalid_exercise_reps');
  if (!Number.isInteger(restSeconds) || restSeconds < 0 || restSeconds > 600) throw new HttpError(400, 'El descanso debe estar entre 0 y 600 segundos', 'invalid_rest_seconds');
  return {
    name: text(input.name, 'nombre del ejercicio', 120),
    muscleGroup: text(input.muscleGroup, 'grupo muscular', 80),
    movements, riskZones, machineId: input.machineId || null,
    alternatives, bodyweightAlternative: input.bodyweightAlternative ? text(input.bodyweightAlternative, 'alternativa sin máquina', 120) : null,
    defaultSets: series, defaultReps: repetitions,
    restSeconds,
    active: input.active !== false,
  };
}

function normalizeWorkoutSet(input = {}) {
  const setNumber = Number(input.setNumber);
  const reps = Number(input.reps);
  const weightKg = Number(input.weightKg);
  if (!Number.isInteger(setNumber) || setNumber < 1 || setNumber > 20) throw new HttpError(400, 'El número de serie debe estar entre 1 y 20', 'invalid_set_number');
  if (!Number.isInteger(reps) || reps < 0 || reps > 1000) throw new HttpError(400, 'Las repeticiones deben estar entre 0 y 1000', 'invalid_reps');
  if (!Number.isFinite(weightKg) || weightKg < 0 || weightKg > 1000) throw new HttpError(400, 'El peso debe estar entre 0 y 1000 kg', 'invalid_weight');
  return { setNumber, reps, weightKg, completed: input.completed !== false };
}

function selectAvailableExercise(exercise, machines) {
  const available = machines.find(machine => machine._id.toString() === String(exercise.machineId) && machine.state === 'DISPONIBLE');
  if (available) return { ...exercise, machineId: String(available._id), equipment: available.name, substituted: false };
  const alternatives = machines.filter(machine => machine.state === 'DISPONIBLE' && (exercise.alternatives || []).includes(machine.name));
  if (alternatives.length) return { ...exercise, machineId: String(alternatives[0]._id), equipment: alternatives[0].name, substituted: true };
  if (exercise.bodyweightAlternative) return { ...exercise, machineId: null, equipment: null, name: exercise.bodyweightAlternative, substituted: true };
  return null;
}

function buildSafeRoutine(candidates, restrictions, machines) {
  const result = [];
  for (const exercise of candidates) {
    if (!isExerciseAllowed(exercise, restrictions)) continue;
    const selected = selectAvailableExercise({ ...exercise, machineId: exercise.machineId ? String(exercise.machineId) : null }, machines);
    if (exercise.machineId && !selected) continue;
    result.push({
      exerciseId: String(exercise._id), name: selected?.name || exercise.name,
      sets: exercise.defaultSets, reps: exercise.defaultReps, restSeconds: exercise.restSeconds,
      equipment: selected?.equipment || null, substituted: selected?.substituted || false,
    });
  }
  return result;
}

module.exports = {
  MACHINE_STATES, EVALUATION_RESULTS, normalizeSite, normalizeMachine, validateMachine,
  normalizeEvaluation, isExerciseAllowed, selectAvailableExercise,
  normalizeExercise, normalizeWorkoutSet,
  buildSafeRoutine,
};
