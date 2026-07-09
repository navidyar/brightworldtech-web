const express = require('express');
const lotController = require('../controllers/lotController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

const lotManagementRoles = ['admin', 'management'];

router.get(
  '/management/lots/new/modal',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.renderNewLotModal
);

router.get(
  '/management/lots/new',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.renderNewLotPage
);

router.get(
  '/management/lots/:lotId/edit/modal',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.renderEditLotModal
);

router.post(
  '/management/lots/:lotId/edit/modal',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.updateLotModal
);


router.get(
  '/management/lots/:lotId/hide/modal',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.renderLotVisibilityModal
);

router.post(
  '/management/lots/:lotId/hide',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.updateLotVisibility
);

router.get(
  '/management/lots/:lotId/unhide/modal',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.renderLotVisibilityModal
);

router.post(
  '/management/lots/:lotId/unhide',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.updateLotVisibility
);

router.get(
  '/management/lots/:lotId/close/modal',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.renderLotClosureModal
);

router.post(
  '/management/lots/:lotId/close',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.updateLotClosure
);

router.get(
  '/management/lots/:lotId/reopen/modal',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.renderLotClosureModal
);

router.post(
  '/management/lots/:lotId/reopen',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.updateLotClosure
);

router.get(
  '/management/lots/:lotId/delete/modal',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.renderDeleteLotModal
);

router.post(
  '/management/lots/:lotId/delete',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.deleteLot
);

router.get(
  '/management/lots/:lotId/requirements/modal',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.renderLotRequirementsModal
);

router.get(
  '/management/lots/:lotId/enforcement/modal',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.renderLotEnforcementModal
);

router.get(
  '/management/lots/:lotId/requirements/new/modal',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.renderNewLotRequirementModal
);

router.post(
  '/management/lots/:lotId/requirements',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.createLotRequirement
);

router.get(
  '/management/lots/:lotId/requirements/:requirementId/edit/modal',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.renderEditLotRequirementModal
);

router.post(
  '/management/lots/:lotId/requirements/:requirementId/edit/modal',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.updateLotRequirementModal
);

router.get(
  '/management/lots/:lotId',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.renderLotDetailPage
);

router.post(
  '/management/lots',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.createLot
);

router.get(
  '/management/lots',
  requireAuth,
  requireRole(lotManagementRoles),
  lotController.renderLotsPage
);

module.exports = router;
