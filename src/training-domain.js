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

function selectAvailableExercise(exercise, machines) {
  const available = machines.find(machine => machine._id.toString() === String(exercise.machineId) && machine.state === 'DISPONIBLE');
  if (available) return { ...exercise, machineId: String(available._id), equipment: available.name, substituted: false };
  const alternatives = machines.filter(machine => machine.state === 'DISPONIBLE' && (exercise.alternatives || []).includes(machine.name));
  if (alternatives.length) return { ...exercise, machineId: String(alternatives[0]._id), equipment: alternatives[0].name, substituted: true };
  if (exercise.bodyweightAlternative) return { ...exercise, machineId: null, equipment: null, name: exercise.bodyweightAlternative, substituted: true };
  return null;
}

module.exports = {
  MACHINE_STATES, EVALUATION_RESULTS, normalizeSite, normalizeMachine, validateMachine,
  normalizeEvaluation, isExerciseAllowed, selectAvailableExercise,
};
