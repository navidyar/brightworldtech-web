'use strict';

const NEW_LOT_VISIBILITY = Object.freeze({
  isActive: 0,
  isHidden: true,
  requiresManualUnhide: true
});

function getNewLotInitialActiveValue() {
  return NEW_LOT_VISIBILITY.isActive;
}

function buildNewLotCreatedRedirect(lotId) {
  const normalizedLotId = Number(lotId);

  if (!Number.isInteger(normalizedLotId) || normalizedLotId <= 0) {
    throw new TypeError('A valid new Lot ID is required to build the post-create redirect.');
  }

  return `/management/lots/${normalizedLotId}?created=1`;
}

module.exports = {
  NEW_LOT_VISIBILITY,
  buildNewLotCreatedRedirect,
  getNewLotInitialActiveValue
};
