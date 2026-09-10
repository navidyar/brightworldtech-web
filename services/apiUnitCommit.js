'use strict';

const { pool } = require('../models/db');
const apiUnitIntake = require('./apiUnitIntake');
const apiScalarInventory = require('./apiScalarInventory');

const TEST_FIELD_KEYS = new Set([
  'keyboard_test',
  'microphone_check',
  'audio_output_check',
  'driver_check',
  'virus_check',
  'camera_test',
  'biometrics_test',
  'techtools_diagnostics'
]);

class ApiUnitCommitError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'ApiUnitCommitError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value, maxLength = 191) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeBoolean(value) {
  if (value === true || value === 1 || value === '1') return true;
  return String(value || '').trim().toLowerCase() === 'true';
}

function asCommitError(error) {
  if (error instanceof ApiUnitCommitError) return error;
  if (error instanceof apiUnitIntake.ApiUnitIntakeError || error instanceof apiScalarInventory.ApiScalarInventoryError) {
    return new ApiUnitCommitError(error.status, error.code, error.message, error.details || null);
  }
  return error;
}

function summarizeInventory(inventory = {}, preflightWarnings = []) {
  const observations = Array.isArray(inventory.observations) ? inventory.observations : [];
  const acceptedFields = observations
    .filter((observation) => ['applied', 'unchanged'].includes(observation.application_status))
    .map((observation) => observation.field_key);
  const protectedFields = observations
    .filter((observation) => observation.application_status === 'blocked_manual')
    .map((observation) => observation.field_key);
  const ignoredFields = observations
    .filter((observation) => observation.application_status === 'ignored_unknown')
    .map((observation) => ({
      field_key: observation.field_key,
      reason: observation.application_reason || 'ignored'
    }));
  const storedTestResults = observations.filter((observation) => TEST_FIELD_KEYS.has(observation.field_key));
  const warnings = [
    ...(Array.isArray(preflightWarnings) ? preflightWarnings : []),
    ...ignoredFields.map((field) => ({
      code: 'FIELD_IGNORED',
      field_key: field.field_key,
      message: `BWTDallas ignored ${field.field_key}: ${field.reason}.`
    }))
  ];

  return {
    accepted_fields: acceptedFields,
    protected_fields: protectedFields,
    ignored_fields: ignoredFields,
    stored_test_results: storedTestResults,
    warnings
  };
}

function preflightDetails(resolution) {
  return {
    resolution_status: resolution?.status || null,
    match_mode: resolution?.match_mode || null,
    match_count: Number(resolution?.match_count || 0),
    matches: Array.isArray(resolution?.matches) ? resolution.matches : [],
    preflight: resolution?.preflight || null
  };
}

function assertPreflightCanProceed(resolution) {
  if (!resolution?.preflight || resolution.preflight.read_only !== true) {
    throw new ApiUnitCommitError(409, 'PREFLIGHT_REQUIRED', 'Commit requires a fresh BWTDallas Resolve + Preflight evaluation.');
  }
  if (resolution.preflight.can_proceed !== true) {
    throw new ApiUnitCommitError(
      409,
      'PREFLIGHT_BLOCKED',
      'BWTDallas Preflight does not allow this Tool submission to be committed.',
      preflightDetails(resolution)
    );
  }
  if (resolution.preflight.unit_action?.action_required) {
    throw new ApiUnitCommitError(
      409,
      'EXPLICIT_UNIT_ACTION_REQUIRED',
      'Resolve the required BWTDallas move/takeover action before committing Tool data.',
      preflightDetails(resolution)
    );
  }
}

async function buildReplayResponse({ submission, resolution, requestedUnitId, userId, intentionalDuplicate = false }) {
  if (!submission) return null;
  if (submission.status !== 'COMPLETED') {
    throw new ApiUnitCommitError(409, 'SUBMISSION_IN_PROGRESS', 'This submission ID already exists but is not completed.');
  }
  if (submission.submitted_by_user_id && Number(submission.submitted_by_user_id) !== Number(userId)) {
    throw new ApiUnitCommitError(409, 'SUBMISSION_USER_CONFLICT', 'This submission ID belongs to a different authenticated technician.');
  }

  const matchedUnitId = resolution?.status === 'MATCHED'
    ? normalizePositiveInteger(resolution?.unit?.unit_id)
    : null;
  const candidateUnitIds = new Set((Array.isArray(resolution?.matches) ? resolution.matches : [])
    .map((candidate) => normalizePositiveInteger(candidate?.unit_id))
    .filter(Boolean));
  const identityMatchesSubmission = matchedUnitId === Number(submission.unit_id)
    || (intentionalDuplicate && candidateUnitIds.has(Number(submission.unit_id)));
  if (!identityMatchesSubmission) {
    throw new ApiUnitCommitError(
      409,
      'SUBMISSION_IDENTITY_CONFLICT',
      'This submission ID is already associated with a different Unit identity. Run Resolve + Preflight again.'
    );
  }
  if (requestedUnitId && requestedUnitId !== Number(submission.unit_id)) {
    throw new ApiUnitCommitError(409, 'SUBMISSION_UNIT_CONFLICT', 'The supplied Unit ID does not match the Unit already stored for this submission ID.');
  }

  const unit = await apiUnitIntake.serializeUnit(submission.unit_id);
  const summary = summarizeInventory(submission, resolution?.preflight?.warnings);
  return {
    status: 'REPLAYED',
    replayed: true,
    submission_id: submission.report_id,
    unit,
    tool_run: submission,
    ...summary
  };
}

async function createAndIngestUnit({ body, userId, toolSource, submissionId, resolution }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const created = await apiUnitIntake.createUnitForCommit({
      body,
      userId,
      toolSource,
      connection
    });
    const inventory = await apiScalarInventory.ingestScalarInventory({
      unitId: created.unitId,
      reportId: submissionId,
      body,
      userId,
      toolSource,
      connection,
      beforeFormData: {
        ...created.formData,
        assetTag: created.assetTag
      },
      ensureSpecificationsRow: true,
      expectedUnitState: {
        lot_id: normalizePositiveInteger(created.formData.lotId),
        assigned_to_user_id: normalizePositiveInteger(userId),
        is_parked: false
      }
    });
    await connection.commit();

    const unit = await apiUnitIntake.serializeUnit(created.unitId);
    return {
      status: 'CREATED',
      replayed: false,
      submission_id: submissionId,
      unit,
      asset_tag: created.assetTag,
      duplicate_review: created.duplicateReview,
      tool_run: inventory,
      ...summarizeInventory(inventory, resolution.preflight.warnings)
    };
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}

    if (error?.code === 'ER_DUP_ENTRY') {
      const concurrentSubmission = await apiScalarInventory.getSubmissionById({
        toolSource,
        reportId: submissionId
      });
      if (concurrentSubmission && Number(concurrentSubmission.submitted_by_user_id || 0) === Number(userId)) {
        const unit = await apiUnitIntake.serializeUnit(concurrentSubmission.unit_id);
        return {
          status: 'REPLAYED',
          replayed: true,
          submission_id: submissionId,
          unit,
          tool_run: concurrentSubmission,
          ...summarizeInventory(concurrentSubmission, resolution.preflight.warnings)
        };
      }
      throw new ApiUnitCommitError(
        409,
        'COMMIT_CONFLICT',
        'Another Unit or submission changed while Commit was being applied. Run Resolve + Preflight again.'
      );
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function commitUnit({ body = {}, userId, roleCodes = [], toolSource }) {
  const submissionId = normalizeText(body.submission_id ?? body.submissionId ?? body.report_id ?? body.reportId);
  const intentionalDuplicate = normalizeBoolean(body.confirm_duplicate_match_creation ?? body.confirmDuplicateMatchCreation);
  if (!submissionId) {
    throw new ApiUnitCommitError(400, 'SUBMISSION_ID_REQUIRED', 'A submission_id is required for Commit idempotency.');
  }

  const requestedUnitIdRaw = body.unit_id ?? body.unitId;
  const requestedUnitId = normalizePositiveInteger(requestedUnitIdRaw);
  if (requestedUnitIdRaw !== undefined && requestedUnitIdRaw !== null && String(requestedUnitIdRaw).trim() !== '' && !requestedUnitId) {
    throw new ApiUnitCommitError(400, 'INVALID_UNIT_ID', 'The supplied Unit ID is invalid.');
  }

  let resolution;
  try {
    resolution = await apiUnitIntake.resolveUnit(body, {
      preflightContext: { userId, roleCodes, toolSource }
    });
    assertPreflightCanProceed(resolution);

    const existingSubmission = await apiScalarInventory.getSubmissionById({
      toolSource,
      reportId: submissionId
    });
    const replay = await buildReplayResponse({
      submission: existingSubmission,
      resolution,
      requestedUnitId,
      userId,
      intentionalDuplicate
    });
    if (replay) return replay;

    if (intentionalDuplicate) {
      if (requestedUnitId) {
        throw new ApiUnitCommitError(409, 'INTENTIONAL_DUPLICATE_UNIT_ID_NOT_ALLOWED', 'Do not supply unit_id when explicitly creating an Intentional Duplicate Unit.');
      }
      return await createAndIngestUnit({ body, userId, toolSource, submissionId, resolution });
    }

    if (resolution.status === 'MATCHED') {
      const matchedUnitId = normalizePositiveInteger(resolution.unit?.unit_id);
      if (!requestedUnitId) {
        throw new ApiUnitCommitError(400, 'UNIT_ID_REQUIRED', 'Commit requires unit_id when Resolve + Preflight identifies an existing Unit.');
      }
      if (!matchedUnitId || requestedUnitId !== matchedUnitId) {
        throw new ApiUnitCommitError(
          409,
          'UNIT_IDENTITY_CHANGED',
          'The supplied Unit ID does not match the Unit identified by the fresh Resolve + Preflight evaluation.',
          preflightDetails(resolution)
        );
      }

      const inventory = await apiScalarInventory.ingestScalarInventory({
        unitId: matchedUnitId,
        reportId: submissionId,
        body,
        userId,
        toolSource,
        expectedUnitState: resolution.preflight.current_unit
      });
      const unit = await apiUnitIntake.serializeUnit(matchedUnitId);
      return {
        status: inventory.replayed ? 'REPLAYED' : 'UPDATED',
        replayed: Boolean(inventory.replayed),
        submission_id: submissionId,
        unit,
        tool_run: inventory,
        ...summarizeInventory(inventory, resolution.preflight.warnings)
      };
    }

    if (resolution.status !== 'NOT_FOUND') {
      throw new ApiUnitCommitError(409, 'UNSAFE_UNIT_IDENTITY', 'BWTDallas cannot safely commit this submission because Unit identity is unresolved.', preflightDetails(resolution));
    }
    if (requestedUnitId) {
      throw new ApiUnitCommitError(
        409,
        'UNIT_IDENTITY_CHANGED',
        'The supplied Unit ID no longer matches the physical Unit identifiers. Run Resolve + Preflight again.',
        preflightDetails(resolution)
      );
    }

    return await createAndIngestUnit({ body, userId, toolSource, submissionId, resolution });
  } catch (error) {
    throw asCommitError(error);
  }
}

module.exports = {
  ApiUnitCommitError,
  summarizeInventory,
  assertPreflightCanProceed,
  commitUnit
};
