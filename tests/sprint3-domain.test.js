const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET ||= 'unit-test-secret-with-at-least-32-characters';
process.env.PASS_SECRET ||= 'unit-test-pass-secret-with-at-least-32-characters';
const { fatigueReduction, normalizeFatigueLevel, normalizeRpe, applyReduction, normalizeMediaMetadata, NUTRITION_GUIDES } = require('../src/sprint3');

test('adapta carga de rutina según fatiga y conserva al menos una serie y repetición', () => {
  assert.equal(fatigueReduction('BAJA', 20), 0);
  assert.equal(fatigueReduction('MEDIA', 20), 10);
  assert.equal(fatigueReduction('ALTA', 20), 20);
  assert.deepEqual(applyReduction([{ sets: 1, reps: 1 }], 50), [{ sets: 1, reps: 1 }]);
  assert.throws(() => normalizeFatigueLevel('EXTREMA'), /fatiga/);
});

test('valida RPE, tipo y tamaño de videos de ejercicios', () => {
  assert.equal(normalizeRpe(8), 8);
  assert.throws(() => normalizeRpe(11), /RPE/);
  assert.deepEqual(normalizeMediaMetadata({ title: 'Sentadilla', contentType: 'video/mp4', sizeBytes: 128 }, 1024), { title: 'Sentadilla', contentType: 'video/mp4', sizeBytes: 128 });
  assert.throws(() => normalizeMediaMetadata({ title: 'Archivo', contentType: 'application/octet-stream', sizeBytes: 10 }, 1024), /Formato/);
  assert.throws(() => normalizeMediaMetadata({ title: 'Archivo', contentType: 'video/mp4', sizeBytes: 2048 }, 1024), /pesar/);
  assert.ok(NUTRITION_GUIDES.length > 0);
});
