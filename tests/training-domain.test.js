const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSite, normalizeMachine, validateMachine, normalizeEvaluation, isExerciseAllowed, selectAvailableExercise, normalizeExercise, normalizeWorkoutSet, buildSafeRoutine } = require('../src/training-domain');

test('valida sedes y normaliza identificadores de máquina', () => {
  assert.deepEqual(normalizeSite({ name: 'Sede Centro', address: 'Av. Central 100' }), { name: 'Sede Centro', address: 'Av. Central 100', active: true });
  assert.equal(normalizeMachine({ code: 'p-1', serialNumber: 's-8', name: 'Prensa', muscleGroup: 'Piernas', siteId: 'centro' }).code, 'P-1');
  assert.throws(() => validateMachine({ ...normalizeMachine({ code: 'p', serialNumber: 's', name: 'Prensa', muscleGroup: 'piernas', siteId: 'centro' }), state: 'DAÑADA' }), { code: 'invalid_machine_state' });
});

test('valida evaluaciones y filtra ejercicios por zona y movimiento', () => {
  const evaluation = normalizeEvaluation({ result: 'APROBADO', diagnosis: 'reservado', restrictions: [{ zone: 'Hombro', movements: ['Press'] }] });
  assert.equal(evaluation.restrictions[0].zone, 'hombro');
  assert.equal(isExerciseAllowed({ riskZones: ['HOMBRO'], movements: ['press'] }, evaluation.restrictions), false);
  assert.equal(isExerciseAllowed({ riskZones: ['pierna'], movements: ['sentadilla'] }, evaluation.restrictions), true);
  assert.throws(() => normalizeEvaluation({ result: 'PENDIENTE' }), { code: 'invalid_evaluation_result' });
});

test('sustituye equipo indisponible o excluye el ejercicio sin alternativa', () => {
  const machines = [{ _id: { toString: () => '2' }, state: 'DISPONIBLE', name: 'Mancuernas' }];
  assert.equal(selectAvailableExercise({ name: 'Press en máquina', machineId: '1', alternatives: ['Mancuernas'] }, machines).substituted, true);
  assert.equal(selectAvailableExercise({ name: 'Prensa', machineId: '1' }, machines), null);
});

test('normaliza catálogo de ejercicios y valida series, repeticiones y peso', () => {
  const exercise = normalizeExercise({ name: 'Sentadilla', muscleGroup: 'Piernas', riskZones: ['Rodilla'], defaultSets: 4, defaultReps: 12 });
  assert.equal(exercise.defaultSets, 4);
  assert.deepEqual(normalizeWorkoutSet({ setNumber: 1, reps: 12, weightKg: 20 }), { setNumber: 1, reps: 12, weightKg: 20, completed: true });
  assert.throws(() => normalizeWorkoutSet({ setNumber: 0, reps: -1, weightKg: 3000 }), { code: 'invalid_set_number' });
});

test('la rutina final excluye riesgos y máquinas fuera de servicio', () => {
  const machines = [{ _id: { toString: () => 'available' }, name: 'Mancuernas', state: 'DISPONIBLE' }];
  const candidates = [
    { _id: 'a', name: 'Press', machineId: 'missing', alternatives: ['Mancuernas'], riskZones: [], movements: [], defaultSets: 3, defaultReps: 10, restSeconds: 60 },
    { _id: 'b', name: 'Elevación', machineId: null, riskZones: ['hombro'], movements: ['press'], defaultSets: 3, defaultReps: 10, restSeconds: 60 },
    { _id: 'c', name: 'Sentadilla', machineId: 'offline', riskZones: [], movements: [], defaultSets: 3, defaultReps: 10, restSeconds: 60 },
  ];
  const result = buildSafeRoutine(candidates, [{ zone: 'hombro', movements: ['press'] }], machines);
  assert.deepEqual(result.map(item => [item.name, item.substituted]), [['Press', true]]);
});
