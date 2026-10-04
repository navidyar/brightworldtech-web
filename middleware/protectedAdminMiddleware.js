'use strict';

const { canManageUser } = require('../config/protectedAdmin');
const userManagementAudit = require('../models/userManagementAuditModel');

async function requireProtectedAdminAccess(req, res, next) {
  if (canManageUser(req.currentUser && req.currentUser.user_id, req.params.userId)) {
    return next();
  }

  const action = req.path && req.path.includes('/deactivate') ? 'user_deactivation_blocked'
    : req.path && req.path.includes('/delete-pending') ? 'user_deletion_blocked'
      : req.path && req.path.includes('/edit') ? 'user_update_blocked'
        : 'user_management_blocked';
  try {
    await userManagementAudit.recordBlocked({
      actorUserId: req.currentUser && req.currentUser.user_id,
      targetUserId: req.params.userId,
      action,
      reason: 'Only the account owner can manage this protected Admin account.'
    });
  } catch (error) {
    console.error('Unable to record blocked protected-account action:', error);
  }

  return res.status(403).render('pages/error', {
    pageTitle: 'Protected Admin Account',
    message: 'Only the account owner can manage this protected Admin account.',
    error: null
  });
}

module.exports = { requireProtectedAdminAccess };
