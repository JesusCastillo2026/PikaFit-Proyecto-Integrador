const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('hex');
process.env.PASS_SECRET ||= crypto.randomBytes(32).toString('hex');
process.env.CLINICAL_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString('hex');

const { encryptClinicalText, decryptClinicalText } = require('../src/clinical-crypto');

test('cifra datos clínicos con AES-GCM y los recupera', () => {
  const encrypted = encryptClinicalText('observación confidencial');
  assert.equal(encrypted.algorithm, 'aes-256-gcm');
  assert.equal(JSON.stringify(encrypted).includes('observación confidencial'), false);
  assert.equal(decryptClinicalText(encrypted), 'observación confidencial');
});

test('el cifrado usa un IV distinto y detecta alteraciones', () => {
  const first = encryptClinicalText('diagnóstico');
  const second = encryptClinicalText('diagnóstico');
  assert.notEqual(first.iv, second.iv);
  first.ciphertext = Buffer.alloc(12, 1).toString('base64');
  assert.throws(() => decryptClinicalText(first), { code: 'clinical_decryption_failed' });
});
