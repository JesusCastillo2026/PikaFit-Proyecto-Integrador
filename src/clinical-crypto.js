const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');
const config = require('./config');
const { HttpError } = require('./http');

function encryptionKey() {
  if (!config.clinicalEncryptionKey) {
    throw new HttpError(503, 'El cifrado clínico no está configurado', 'clinical_encryption_unavailable');
  }
  return config.clinicalEncryptionKey;
}

function encryptClinicalText(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authenticationTag: cipher.getAuthTag().toString('base64'),
  };
}

function decryptClinicalText(payload) {
  if (!payload || payload.algorithm !== 'aes-256-gcm') return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.authenticationTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new HttpError(503, 'No se pudo descifrar el dato clínico', 'clinical_decryption_failed');
  }
}

module.exports = { encryptClinicalText, decryptClinicalText };
