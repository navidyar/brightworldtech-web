'use strict';

const clients = new Set();
const HEARTBEAT_MS = 25000;

function writeEvent(res, eventName, payload = {}) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function streamPrinterRegistryEvents(req, res) {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream',
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

function broadcastPrinterRegistryChange() {
  for (const res of clients) {
    try {
      writeEvent(res, 'label-printer-registry-changed', {});
    } catch (_error) {
      clients.delete(res);
    }
  }
}

module.exports = {
  streamPrinterRegistryEvents,
  broadcastPrinterRegistryChange
};
