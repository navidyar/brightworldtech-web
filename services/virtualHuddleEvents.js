'use strict';

const clientsByUserId = new Map();

function normalizeUserId(userId) {
  const value = Number.parseInt(userId, 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function writeEvent(res, eventName, payload = {}) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function addVirtualHuddleClient(userId, res) {
  const safeUserId = normalizeUserId(userId);
  if (!safeUserId) return () => {};

  if (!clientsByUserId.has(safeUserId)) {
    clientsByUserId.set(safeUserId, new Set());
  }

  const clients = clientsByUserId.get(safeUserId);
  clients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (error) {
      clearInterval(heartbeat);
    }
  }, 25000);
  heartbeat.unref?.();

  return () => {
    clearInterval(heartbeat);
    clients.delete(res);
    if (clients.size === 0) clientsByUserId.delete(safeUserId);
  };
}

function publishVirtualHuddleChange(userIds, reason = 'changed') {
  const uniqueUserIds = [...new Set((Array.isArray(userIds) ? userIds : [userIds])
    .map(normalizeUserId)
    .filter(Boolean))];

  for (const userId of uniqueUserIds) {
    const clients = clientsByUserId.get(userId);
    if (!clients) continue;

    for (const res of [...clients]) {
      try {
        writeEvent(res, 'virtual-huddle-change', { reason });
      } catch (error) {
        clients.delete(res);
      }
    }

    if (clients.size === 0) clientsByUserId.delete(userId);
  }
}

module.exports = {
  addVirtualHuddleClient,
  publishVirtualHuddleChange,
  writeEvent
};
