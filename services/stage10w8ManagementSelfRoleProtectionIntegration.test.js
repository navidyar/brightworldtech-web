'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbModulePath = require.resolve('../models/db');
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: {
    pool: {
      async query() {
        throw new Error('Unexpected database query in controller integration test.');
      },
      async getConnection() {
        throw new Error('Unexpected database connection in controller integration test.');
      }
    }
  }
};

const managementController = require('../controllers/managementController');
const managementModel = require('../models/managementModel');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function makeUser(overrides = {}) {
  return {
    user_id: 22,
    first_name: 'Morgan',
    last_name: 'Manager',
    email: 'morgan.manager@example.com',
    roles: ['management'],
    primary_role_code: 'management',
    primary_role_name: 'Management',
    role_names: 'Management',
    is_active: true,
    account_status_code: 'active',
    account_status_label: 'Active Account',
    ...overrides
  };
}

function makeAdminUser(overrides = {}) {
  return makeUser({
    user_id: 1,
    first_name: 'Avery',
    last_name: 'Admin',
    email: 'avery.admin@example.com',
    roles: ['admin'],
    primary_role_code: 'admin',
    primary_role_name: 'Admin',
    role_names: 'Admin',
    ...overrides
  });
}

function makeRequest({ targetUserId = 22, actorUser = makeUser(), roleCodes = 'management' } = {}) {
  return {
    currentUser: actorUser,
    params: { userId: String(targetUserId) },
    query: { returnPath: 'active' },
    body: {
      returnPath: 'active',
      firstName: 'Morgan',
      lastName: 'Manager',
      email: 'morgan.manager@example.com',
      roleCodes
    },
    get() {
      return '';
    }
  };
}

function makeResponse() {
  const state = {
    renderView: null,
    renderLocals: null,
    redirectUrl: null,
    statusCode: 200
  };

  const response = {
    state,
    status(statusCode) {
      state.statusCode = statusCode;
      return response;
    },
    render(view, locals) {
      state.renderView = view;
      state.renderLocals = locals;
      return response;
    },
    redirect(url) {
      state.redirectUrl = url;
      return response;
    },
    set() {
      return response;
    },
    send() {
      return response;
    }
  };

  return response;
}

async function withManagementModelStubs(stubs, callback) {
  const originals = {};

  for (const [name, replacement] of Object.entries(stubs)) {
    originals[name] = managementModel[name];
    managementModel[name] = replacement;
  }

  try {
    return await callback();
  } finally {
    for (const [name, original] of Object.entries(originals)) {
      managementModel[name] = original;
    }
  }
}

test('Management self-edit renders the role as locked without loading assignable role choices', async () => {
  let roleListLoaded = false;
  const req = makeRequest();
  const res = makeResponse();

  await withManagementModelStubs({
    getUserById: async () => makeUser(),
    listAssignableAccountRoles: async () => {
      roleListLoaded = true;
      return [];
    }
  }, async () => {
    await managementController.renderEditUserModal(req, res, assert.fail);
  });

  assert.equal(roleListLoaded, false);
  assert.equal(res.state.renderView, 'fragments/management-user-edit-modal');
  assert.equal(res.state.renderLocals.roleEditingLocked, true);
  assert.deepEqual(res.state.renderLocals.roles, []);
});

test('Management self profile save preserves user_roles by using the profile-only model path', async () => {
  let profileUpdate = null;
  let roleUpdateCalled = false;
  const req = makeRequest();
  const res = makeResponse();

  await withManagementModelStubs({
    getUserById: async () => makeUser(),
    listAssignableAccountRoles: async () => assert.fail('Self-edit must not load role choices.'),
    updateUserProfile: async (payload) => {
      profileUpdate = payload;
      return makeUser(payload);
    },
    updateUserWithRoles: async () => {
      roleUpdateCalled = true;
    }
  }, async () => {
    await managementController.updateUserModal(req, res, assert.fail);
  });

  assert.deepEqual(profileUpdate, {
    userId: 22,
    firstName: 'Morgan',
    lastName: 'Manager',
    email: 'morgan.manager@example.com',
    personalEmail: null,
    phone: null,
    startDate: null,
    endDate: null
  });
  assert.equal(roleUpdateCalled, false);
  assert.equal(res.state.redirectUrl, '/management/users?updated=1');
});

test('Management self role tampering is rejected before any user update', async () => {
  let updateCalled = false;
  const req = makeRequest({ roleCodes: 'tech' });
  const res = makeResponse();

  await withManagementModelStubs({
    getUserById: async () => makeUser(),
    updateUserProfile: async () => {
      updateCalled = true;
    },
    updateUserWithRoles: async () => {
      updateCalled = true;
    }
  }, async () => {
    await managementController.updateUserModal(req, res, assert.fail);
  });

  assert.equal(updateCalled, false);
  assert.equal(res.state.renderView, 'fragments/management-user-edit-modal');
  assert.equal(res.state.renderLocals.roleEditingLocked, true);
  assert.match(res.state.renderLocals.errorMessages.join(' '), /cannot change their own access role/i);
});

test('Admin self-edit renders the Admin role as locked without loading assignable role choices', async () => {
  let roleListLoaded = false;
  const adminUser = makeAdminUser();
  const req = makeRequest({ targetUserId: 1, actorUser: adminUser, roleCodes: 'admin' });
  req.body.firstName = 'Avery';
  req.body.lastName = 'Admin';
  req.body.email = 'avery.admin@example.com';
  const res = makeResponse();

  await withManagementModelStubs({
    getUserById: async () => adminUser,
    listAssignableAccountRoles: async () => {
      roleListLoaded = true;
      return [];
    }
  }, async () => {
    await managementController.renderEditUserModal(req, res, assert.fail);
  });

  assert.equal(roleListLoaded, false);
  assert.equal(res.state.renderLocals.roleEditingLocked, true);
  assert.equal(res.state.renderLocals.roleEditingLockCode, 'admin');
  assert.deepEqual(res.state.renderLocals.roles, []);
});

test('Admin self profile save preserves the Admin role through the profile-only model path', async () => {
  let profileUpdate = null;
  let roleUpdateCalled = false;
  const adminUser = makeAdminUser();
  const req = makeRequest({ targetUserId: 1, actorUser: adminUser, roleCodes: 'admin' });
  req.body.firstName = 'Avery';
  req.body.lastName = 'Admin';
  req.body.email = 'avery.admin@example.com';
  const res = makeResponse();

  await withManagementModelStubs({
    getUserById: async () => adminUser,
    listAssignableAccountRoles: async () => assert.fail('Admin self-edit must not load role choices.'),
    updateUserProfile: async (payload) => {
      profileUpdate = payload;
      return makeAdminUser(payload);
    },
    updateUserWithRoles: async () => {
      roleUpdateCalled = true;
    }
  }, async () => {
    await managementController.updateUserModal(req, res, assert.fail);
  });

  assert.deepEqual(profileUpdate, {
    userId: 1,
    firstName: 'Avery',
    lastName: 'Admin',
    email: 'avery.admin@example.com',
    personalEmail: null,
    phone: null,
    startDate: null,
    endDate: null
  });
  assert.equal(roleUpdateCalled, false);
  assert.equal(res.state.redirectUrl, '/management/users?updated=1');
});

test('Admin self-demotion tampering is rejected before any user update', async () => {
  let updateCalled = false;
  const adminUser = makeAdminUser();
  const req = makeRequest({ targetUserId: 1, actorUser: adminUser, roleCodes: 'management' });
  req.body.firstName = 'Avery';
  req.body.lastName = 'Admin';
  req.body.email = 'avery.admin@example.com';
  const res = makeResponse();

  await withManagementModelStubs({
    getUserById: async () => adminUser,
    updateUserProfile: async () => {
      updateCalled = true;
    },
    updateUserWithRoles: async () => {
      updateCalled = true;
    }
  }, async () => {
    await managementController.updateUserModal(req, res, assert.fail);
  });

  assert.equal(updateCalled, false);
  assert.equal(res.state.renderLocals.roleEditingLocked, true);
  assert.equal(res.state.renderLocals.roleEditingLockCode, 'admin');
  assert.match(res.state.renderLocals.errorMessages.join(' '), /Admin users cannot change their own access role/i);
});

test('Management may still edit another permitted user role through the existing role-aware update path', async () => {
  let roleUpdate = null;
  const targetUser = makeUser({
    user_id: 23,
    first_name: 'Taylor',
    last_name: 'Tech',
    email: 'taylor.tech@example.com',
    roles: ['tech'],
    primary_role_code: 'tech',
    primary_role_name: 'Tech',
    role_names: 'Tech'
  });
  const req = makeRequest({ targetUserId: 23, roleCodes: 'tech_lead' });
  req.body.firstName = 'Taylor';
  req.body.lastName = 'Tech';
  req.body.email = 'taylor.tech@example.com';
  const res = makeResponse();

  await withManagementModelStubs({
    getUserById: async () => targetUser,
    listAssignableAccountRoles: async () => [
      { code: 'management' },
      { code: 'tech_lead' },
      { code: 'qc' },
      { code: 'tech' }
    ],
    updateUserProfile: async () => assert.fail('Another-user edit must not use profile-only persistence.'),
    updateUserWithRoles: async (payload) => {
      roleUpdate = payload;
      return targetUser;
    }
  }, async () => {
    await managementController.updateUserModal(req, res, assert.fail);
  });

  assert.deepEqual(roleUpdate.roleCodes, ['tech_lead']);
  assert.equal(res.state.redirectUrl, '/management/users?updated=1');
});

test('Admin may still assign a role to another user through the existing role-aware update path', async () => {
  let roleUpdate = null;
  const adminUser = makeAdminUser();
  const targetUser = makeUser({
    user_id: 24,
    first_name: 'Jordan',
    last_name: 'Tech',
    email: 'jordan.tech@example.com',
    roles: ['tech'],
    primary_role_code: 'tech',
    primary_role_name: 'Tech',
    role_names: 'Tech'
  });
  const req = makeRequest({ targetUserId: 24, actorUser: adminUser, roleCodes: 'admin' });
  req.body.firstName = 'Jordan';
  req.body.lastName = 'Tech';
  req.body.email = 'jordan.tech@example.com';
  const res = makeResponse();

  await withManagementModelStubs({
    getUserById: async () => targetUser,
    listAssignableAccountRoles: async () => [
      { code: 'admin' },
      { code: 'management' },
      { code: 'tech_lead' },
      { code: 'qc' },
      { code: 'tech' }
    ],
    updateUserProfile: async () => assert.fail('Another-user Admin edit must not use profile-only persistence.'),
    updateUserWithRoles: async (payload) => {
      roleUpdate = payload;
      return targetUser;
    }
  }, async () => {
    await managementController.updateUserModal(req, res, assert.fail);
  });

  assert.deepEqual(roleUpdate.roleCodes, ['admin']);
  assert.equal(res.state.redirectUrl, '/management/users?updated=1');
});

test('locked modal and profile-only model protect both UI and database role persistence', () => {
  const modal = read('views/fragments/management-user-edit-modal.ejs');
  const model = read('models/managementModel.js');
  const usersPage = read('views/pages/management-users.ejs');

  assert.match(modal, /if \(isRoleEditingLocked\)/);
  assert.match(modal, /lockedRoleLabel/);
  assert.match(modal, /role editing is unavailable for your own <%= lockedRoleLabel %> account/i);
  assert.match(modal, /type="hidden" name="roleCodes"/);
  assert.match(modal, /else \{[\s\S]*type="radio" name="roleCodes"/);

  const profileFunction = model.match(/async function updateUserProfile[\s\S]*?\n}\n\nasync function updateUserWithRoles/);
  assert.ok(profileFunction, 'Expected a dedicated profile-only update function.');
  assert.match(profileFunction[0], /UPDATE users/);
  assert.doesNotMatch(profileFunction[0], /user_roles/);
  assert.match(usersPage, /cannot demote their own Admin account/i);
  assert.match(usersPage, /cannot change their own Management role/i);
});
