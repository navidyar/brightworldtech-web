'use strict';

const clients = new Set();
const HEARTBEAT_MS = 25000;
let sequence = 0;

function writeEvent(res, eventName, payload = {}, eventId = null) {
  if (eventId !== null) {
    res.write(`id: ${eventId}\n`);
  }
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function streamApplicationLiveRefreshEvents(req, res) {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();
  res.write('retry: 5000\n\n');

  clients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch (_error) {
      clients.delete(res);
      clearInterval(heartbeat);
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

function normalizePositiveUnitId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function publishApplicationLiveRefresh({ reason = 'application-data-changed', scope = 'application', unitId = null } = {}) {
  sequence += 1;
  const event = Object.freeze({
    eventId: sequence,
    reason,
    scope: String(scope || 'application'),
    unitId: normalizePositiveUnitId(unitId),
    occurredAt: new Date().toISOString()
  });

  for (const res of [...clients]) {
    try {
      writeEvent(res, 'application-change', event, sequence);
    } catch (_error) {
      clients.delete(res);
    }
  }

  return event;
}

function getApplicationLiveRefreshClientCount() {
  return clients.size;
}

module.exports = {
  streamApplicationLiveRefreshEvents,
  publishApplicationLiveRefresh,
  getApplicationLiveRefreshClientCount
};
