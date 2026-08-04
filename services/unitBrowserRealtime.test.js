const test = require('node:test');
const assert = require('node:assert/strict');

const {
  subscribeToUnitBrowserChanges,
  publishUnitBrowserChange,
  getUnitBrowserRealtimeSubscriberCount
} = require('./unitBrowserRealtime');

test('publishes normalized Unit Browser changes to every active subscriber', () => {
  const receivedA = [];
  const receivedB = [];
  const unsubscribeA = subscribeToUnitBrowserChanges((event) => receivedA.push(event));
  const unsubscribeB = subscribeToUnitBrowserChanges((event) => receivedB.push(event));

  try {
    const event = publishUnitBrowserChange({ unitId: '42', changeType: 'work-completed' });

    assert.equal(event.unitId, 42);
    assert.equal(event.changeType, 'work-completed');
    assert.equal(receivedA.length, 1);
    assert.equal(receivedB.length, 1);
    assert.equal(receivedA[0], event);
    assert.equal(receivedB[0], event);
  } finally {
    unsubscribeA();
    unsubscribeB();
  }
});

test('unsubscribe removes the listener without affecting later Unit mutations', () => {
  const received = [];
  const before = getUnitBrowserRealtimeSubscriberCount();
  const unsubscribe = subscribeToUnitBrowserChanges((event) => received.push(event));

  assert.equal(getUnitBrowserRealtimeSubscriberCount(), before + 1);
  unsubscribe();
  assert.equal(getUnitBrowserRealtimeSubscriberCount(), before);

  publishUnitBrowserChange({ unitId: 7 });
  assert.equal(received.length, 0);
});

test('a failing subscriber does not block other subscribers or the mutation response', () => {
  const received = [];
  const unsubscribeFailing = subscribeToUnitBrowserChanges(() => {
    throw new Error('disconnected');
  });
  const unsubscribeHealthy = subscribeToUnitBrowserChanges((event) => received.push(event));

  try {
    assert.doesNotThrow(() => publishUnitBrowserChange({ unitId: 9, changeType: 'qc-reviewed' }));
    assert.equal(received.length, 1);
    assert.equal(received[0].unitId, 9);
  } finally {
    unsubscribeFailing();
    unsubscribeHealthy();
  }
});
