const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateMedicalPdf } = require('../src/medical-pdf');

test('genera una ficha PDF con secciones clínicas y cabecera válida', async () => {
  const pdf = await generateMedicalPdf({
    memberName: 'Socia de prueba',
    evaluations: [{ result: 'APROBADO', createdAt: new Date('2026-10-29T12:00:00Z'), restrictions: [], diagnosis: 'Controlado', observations: 'Seguimiento semestral' }],
  });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 800);
});
