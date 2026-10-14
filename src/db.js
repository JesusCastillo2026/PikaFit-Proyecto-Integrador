const { MongoClient } = require('mongodb');
const config = require('./config');

let client;
let db;

async function connect() {
  client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db(config.mongoDb);
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('users').createIndex({ dni: 1 }, { unique: true, sparse: true }),
    db.collection('users').createIndex({ role: 1 }),
    db.collection('role_audit').createIndex({ createdAt: -1 }),
    db.collection('role_audit').createIndex({ targetUserId: 1, createdAt: -1 }),
    db.collection('medical_passes').createIndex({ tokenDigest: 1 }, { unique: true }),
    db.collection('medical_passes').createIndex({ codeDigest: 1 }, { unique: true }),
    db.collection('medical_passes').createIndex({ retentionUntil: 1 }, { expireAfterSeconds: 0 }),
    db.collection('medical_passes').createIndex({ memberId: 1, createdAt: -1 }),
    db.collection('medical_passes').createIndex({ clinicId: 1, usedAt: -1 }),
    db.collection('users').createIndex({ role: 1, clinicId: 1, membershipExpiresAt: 1 }),
    db.collection('membership_notifications').createIndex({ memberId: 1, membershipExpiresAt: 1 }, { unique: true }),
    db.collection('membership_notifications').createIndex({ memberId: 1, createdAt: -1 }),
    db.collection('medical_evaluations').createIndex({ clinicId: 1, createdAt: 1 }),
  ]);
  return db;
}

function database() {
  if (!db) throw new Error('La base de datos aún no está conectada');
  return db;
}

async function close() {
  if (client) await client.close();
  client = undefined;
  db = undefined;
}

module.exports = { connect, database, close };

