const { database } = require('./db');
const config = require('./config');

const DAY_MS = 24 * 60 * 60 * 1000;

async function queueMembershipNotices(now = new Date()) {
  const cutoff = new Date(now.getTime() + config.membershipNoticeDays * DAY_MS);
  const members = await database().collection('users').find({
    role: 'SOCIO', membershipExpiresAt: { $gt: now, $lte: cutoff },
  }).project({ name: 1, membershipExpiresAt: 1 }).toArray();
  const notifications = database().collection('membership_notifications');
  let queued = 0;

  for (const member of members) {
    const daysRemaining = Math.max(1, Math.ceil((member.membershipExpiresAt - now) / DAY_MS));
    const result = await notifications.updateOne(
      { memberId: member._id, membershipExpiresAt: member.membershipExpiresAt },
      { $setOnInsert: {
        memberId: member._id,
        membershipExpiresAt: member.membershipExpiresAt,
        type: 'MEMBERSHIP_EXPIRING',
        title: 'Membresía próxima a vencer',
        message: `Hola ${member.name}, tu membresía vence en ${daysRemaining} ${daysRemaining === 1 ? 'día' : 'días'}.`,
        daysRemaining,
        createdAt: now,
        readAt: null,
      } },
      { upsert: true },
    );
    if (result.upsertedCount) queued++;
  }
  return queued;
}

async function notificationsForMember(memberId) {
  return database().collection('membership_notifications')
    .find({ memberId }).sort({ createdAt: -1 }).limit(10)
    .project({ type: 1, title: 1, message: 1, daysRemaining: 1, createdAt: 1, readAt: 1 })
    .toArray();
}

function startMembershipNoticeScheduler() {
  const run = () => queueMembershipNotices().catch(error => console.error('No se pudieron revisar los vencimientos:', error));
  void run();
  const timer = setInterval(run, 6 * 60 * 60 * 1000);
  timer.unref();
  return timer;
}

module.exports = { queueMembershipNotices, notificationsForMember, startMembershipNoticeScheduler };
