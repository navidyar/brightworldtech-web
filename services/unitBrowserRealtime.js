const subscribers = new Set();
let sequence = 0;

function normalizeUnitId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeChangeType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || 'unit-updated';
}

function subscribeToUnitBrowserChanges(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('A Unit Browser realtime listener function is required.');
  }

  subscribers.add(listener);

  return () => {
    subscribers.delete(listener);
  };
}

function publishUnitBrowserChange({ unitId = null, changeType = 'unit-updated' } = {}) {
  sequence += 1;

  const event = Object.freeze({
    eventId: sequence,
    unitId: normalizeUnitId(unitId),
    changeType: normalizeChangeType(changeType),
    occurredAt: new Date().toISOString()
  });

  for (const listener of Array.from(subscribers)) {
    try {
      listener(event);
    } catch (error) {
      // One disconnected or faulty subscriber must not interrupt a completed Unit mutation.
    }
  }

  return event;
}

function getUnitBrowserRealtimeSubscriberCount() {
  return subscribers.size;
}

module.exports = {
  subscribeToUnitBrowserChanges,
  publishUnitBrowserChange,
  getUnitBrowserRealtimeSubscriberCount
};
