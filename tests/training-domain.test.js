const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSite, normalizeMachine, validateMachine, normalizeEvaluation, isExerciseAllowed, selectAvailableExercise } = require('../src/training-domain');

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
