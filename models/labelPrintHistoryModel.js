'use strict';

const { pool } = require('./db');
const labelPrintSettingsModel = require('./labelPrintSettingsModel');

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

function nullablePositiveInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function beginPrintJob({ actorUserId, source = 'single' }) {
  const actorId = positiveInteger(actorUserId, 'User ID');
  const safeSource = String(source || 'single').slice(0, 20);
  const isBulkJob = safeSource === 'bulk';
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let setId = null;

    if (isBulkJob) {
      const [setResult] = await connection.query(
        `INSERT INTO label_print_sets (actor_user_id, grouping_kind)
         VALUES (?, 'batch')`,
        [actorId]
      );
      setId = Number(setResult.insertId);
    } else {
      const printSettings = await labelPrintSettingsModel.getLabelPrintSettings();
      const [sets] = await connection.query(
        `SELECT label_print_set_id
         FROM label_print_sets
         WHERE actor_user_id = ?
           AND grouping_kind = 'auto'
           AND last_activity_at >= DATE_SUB(CURRENT_TIMESTAMP(6), INTERVAL ? MINUTE)
         ORDER BY last_activity_at DESC, label_print_set_id DESC
         LIMIT 1
         FOR UPDATE`,
        [actorId, printSettings.printSetGroupingGapMinutes]
      );

      setId = sets[0] ? Number(sets[0].label_print_set_id) : null;
      if (!setId) {
        const [setResult] = await connection.query(
          `INSERT INTO label_print_sets (actor_user_id, grouping_kind)
           VALUES (?, 'auto')`,
          [actorId]
        );
        setId = Number(setResult.insertId);
      } else {
        await connection.query(
          'UPDATE label_print_sets SET last_activity_at = CURRENT_TIMESTAMP(6) WHERE label_print_set_id = ?',
          [setId]
        );
      }
    }

    const [jobResult] = await connection.query(
      `INSERT INTO label_print_jobs (label_print_set_id, actor_user_id, source, status)
       VALUES (?, ?, ?, 'preparing')`,
      [setId, actorId, safeSource]
    );
    await connection.query(
      'UPDATE label_print_sets SET last_activity_at = CURRENT_TIMESTAMP(6) WHERE label_print_set_id = ?',
      [setId]
    );
    await connection.commit();
    return Object.freeze({ setId, jobId: Number(jobResult.insertId) });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createPrintJobItem({
  jobId,
  unitId = null,
  lotId = null,
  labelTemplateId = null,
  unitLabel,
  lotName,
  templateName,
  templateCategoryCode = null,
  templateRevision = null,
  configSha256 = null,
  copiesRequested = 1
}) {
  const safeJobId = positiveInteger(jobId, 'Print job ID');
  const copies = positiveInteger(copiesRequested, 'Copies requested');
  const [result] = await pool.query(
    `INSERT INTO label_print_job_items
      (label_print_job_id, unit_id, lot_id, label_template_id,
       unit_label_snapshot, lot_name_snapshot, template_id_snapshot,
       template_name_snapshot, template_category_snapshot, template_revision_snapshot,
       config_sha256_snapshot, copies_requested, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'preparing')`,
    [
      safeJobId,
      nullablePositiveInteger(unitId),
      nullablePositiveInteger(lotId),
      nullablePositiveInteger(labelTemplateId),
      String(unitLabel || '').slice(0, 191) || null,
      String(lotName || '').slice(0, 191) || null,
      nullablePositiveInteger(labelTemplateId),
      String(templateName || 'Label Template').slice(0, 160),
      templateCategoryCode ? String(templateCategoryCode).slice(0, 40) : null,
      nullablePositiveInteger(templateRevision),
      configSha256 ? String(configSha256).slice(0, 64) : null,
      copies
    ]
  );
  return Number(result.insertId);
}

async function beginPrintAttempt({ itemId, attemptNumber = 1, printer }) {
  const safeItemId = positiveInteger(itemId, 'Print job item ID');
  const safeAttempt = positiveInteger(attemptNumber, 'Print attempt number');
  const [result] = await pool.query(
    `INSERT INTO label_print_attempts
      (label_print_job_item_id, attempt_number, printer_key_snapshot,
       printer_label_snapshot, printer_location_snapshot, cups_queue_snapshot,
       protocol_snapshot, endpoint_snapshot, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'preparing')`,
    [
      safeItemId,
      safeAttempt,
      printer?.id ? String(printer.id).slice(0, 100) : null,
      printer?.label ? String(printer.label).slice(0, 160) : null,
      printer?.location ? String(printer.location).slice(0, 160) : null,
      printer?.queue ? String(printer.queue).slice(0, 160) : null,
      printer?.protocolCode ? `cups_${String(printer.protocolCode).slice(0, 27)}` : 'cups',
      printer?.endpoint ? String(printer.endpoint).slice(0, 255) : null
    ]
  );
  return Number(result.insertId);
}

async function completePrintAttempt({ attemptId, status, copiesSubmitted = 0, requestIds = [], failureMessage = null }) {
  const safeAttemptId = positiveInteger(attemptId, 'Print attempt ID');
  await pool.query(
    `UPDATE label_print_attempts
     SET status = ?, copies_submitted = ?, cups_job_ids_json = ?, finished_at = CURRENT_TIMESTAMP(6), failure_message = ?
     WHERE label_print_attempt_id = ?`,
    [
      String(status || 'failed').slice(0, 24),
      Math.max(0, Number(copiesSubmitted) || 0),
      JSON.stringify(Array.isArray(requestIds) ? requestIds : []),
      failureMessage ? String(failureMessage).slice(0, 5000) : null,
      safeAttemptId
    ]
  );
}

async function completePrintItem({ itemId, labelTemplateId = null, copiesQueued = 0, status, failureMessage = null, updateTemplateUsage = true }) {
  const safeItemId = positiveInteger(itemId, 'Print job item ID');
  const queued = Math.max(0, Number(copiesQueued) || 0);
  const templateId = nullablePositiveInteger(labelTemplateId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE label_print_job_items
       SET copies_queued = ?, status = ?, failure_message = ?
       WHERE label_print_job_item_id = ?`,
      [queued, String(status || 'failed').slice(0, 24), failureMessage ? String(failureMessage).slice(0, 5000) : null, safeItemId]
    );
    if (templateId && queued > 0 && updateTemplateUsage !== false) {
      await connection.query(
        `UPDATE label_templates
         SET print_count = print_count + ?, last_used_at = CURRENT_TIMESTAMP(6)
         WHERE label_template_id = ?`,
        [queued, templateId]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function completePrintJob({ jobId, status, failureMessage = null }) {
  const safeJobId = positiveInteger(jobId, 'Print job ID');
  await pool.query(
    `UPDATE label_print_jobs
     SET status = ?, failure_message = ?, finished_at = CURRENT_TIMESTAMP(6)
     WHERE label_print_job_id = ?`,
    [String(status || 'failed').slice(0, 20), failureMessage ? String(failureMessage).slice(0, 5000) : null, safeJobId]
  );
}



async function listRecentQueuedAttempts({ actorUserId, minutes }) {
  const actorId = positiveInteger(actorUserId, 'User ID');
  const safeMinutes = positiveInteger(minutes, 'Recent Prints duration');
  const [rows] = await pool.query(
    `SELECT
       a.label_print_attempt_id, a.label_print_job_item_id, i.label_print_job_id,
       a.cups_queue_snapshot, a.cups_job_ids_json
     FROM label_print_sets s
     JOIN label_print_jobs j ON j.label_print_set_id = s.label_print_set_id
     JOIN label_print_job_items i ON i.label_print_job_id = j.label_print_job_id
     JOIN label_print_attempts a ON a.label_print_job_item_id = i.label_print_job_item_id
     WHERE s.actor_user_id = ?
       AND s.last_activity_at >= DATE_SUB(CURRENT_TIMESTAMP(6), INTERVAL ? MINUTE)
       AND a.status = 'queued'
       AND a.copies_submitted > 0
     ORDER BY a.label_print_attempt_id`,
    [actorId, safeMinutes]
  );
  return rows.map((row) => Object.freeze({
    attemptId: Number(row.label_print_attempt_id),
    itemId: Number(row.label_print_job_item_id),
    jobId: Number(row.label_print_job_id),
    cupsQueue: String(row.cups_queue_snapshot || ''),
    cupsJobIdsJson: row.cups_job_ids_json
  }));
}

async function reconcilePrintAttemptStatus({ attemptId, itemId, jobId, status, failureMessage = null }) {
  const safeAttemptId = positiveInteger(attemptId, 'Print attempt ID');
  const safeItemId = positiveInteger(itemId, 'Print item ID');
  const safeJobId = positiveInteger(jobId, 'Print job ID');
  const safeStatus = String(status || '').trim();
  if (!['sent', 'failed', 'partial'].includes(safeStatus)) throw new Error('Unsupported reconciled print status.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE label_print_attempts
       SET status = ?, finished_at = CURRENT_TIMESTAMP(6), failure_message = ?
       WHERE label_print_attempt_id = ? AND status = 'queued'`,
      [safeStatus, failureMessage ? String(failureMessage).slice(0, 5000) : null, safeAttemptId]
    );

    const [attemptRows] = await connection.query(
      `SELECT status FROM label_print_attempts
       WHERE label_print_job_item_id = ?
       ORDER BY attempt_number DESC
       LIMIT 1`,
      [safeItemId]
    );
    const itemStatus = String(attemptRows[0]?.status || 'queued');

    await connection.query(
      `UPDATE label_print_job_items
       SET status = ?, failure_message = CASE WHEN ? IN ('failed', 'partial') THEN COALESCE(?, failure_message) ELSE failure_message END
       WHERE label_print_job_item_id = ?`,
      [itemStatus, itemStatus, failureMessage ? String(failureMessage).slice(0, 5000) : null, safeItemId]
    );

    const [itemRows] = await connection.query(
      'SELECT status FROM label_print_job_items WHERE label_print_job_id = ?',
      [safeJobId]
    );
    const itemStatuses = itemRows.map((row) => String(row.status || ''));
    let jobStatus = 'queued';
    if (itemStatuses.some((value) => value === 'queued' || value === 'preparing')) jobStatus = 'queued';
    else if (itemStatuses.every((value) => value === 'sent')) jobStatus = 'sent';
    else if (itemStatuses.every((value) => value === 'failed')) jobStatus = 'failed';
    else jobStatus = 'partial';
    await connection.query(
      `UPDATE label_print_jobs
       SET status = ?, finished_at = CASE WHEN ? = 'queued' THEN finished_at ELSE CURRENT_TIMESTAMP(6) END
       WHERE label_print_job_id = ?`,
      [jobStatus, jobStatus, safeJobId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getRecentPrintSummary({ actorUserId, minutes }) {
  const actorId = positiveInteger(actorUserId, 'User ID');
  const safeMinutes = positiveInteger(minutes, 'Recent Prints duration');
  const [rows] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN i.status = 'queued' THEN i.copies_queued ELSE 0 END), 0) AS queued_copies,
       COUNT(DISTINCT i.label_print_job_item_id) AS recent_items,
       SUM(CASE WHEN i.status IN ('failed', 'partial') THEN 1 ELSE 0 END) AS issue_items,
       COUNT(DISTINCT s.label_print_set_id) AS set_count
     FROM label_print_sets s
     LEFT JOIN label_print_jobs j ON j.label_print_set_id = s.label_print_set_id
     LEFT JOIN label_print_job_items i ON i.label_print_job_id = j.label_print_job_id
     WHERE s.actor_user_id = ?
       AND s.last_activity_at >= DATE_SUB(CURRENT_TIMESTAMP(6), INTERVAL ? MINUTE)`,
    [actorId, safeMinutes]
  );
  const row = rows[0] || {};
  return Object.freeze({
    queuedCopies: Number(row.queued_copies || 0),
    recentItems: Number(row.recent_items || 0),
    issueItems: Number(row.issue_items || 0),
    setCount: Number(row.set_count || 0)
  });
}

async function listRecentPrintSets({ actorUserId, minutes }) {
  const actorId = positiveInteger(actorUserId, 'User ID');
  const safeMinutes = positiveInteger(minutes, 'Recent Prints duration');
  const [rows] = await pool.query(
    `SELECT
       s.label_print_set_id, s.grouping_kind, s.started_at, s.last_activity_at,
       j.label_print_job_id, j.source, j.status AS job_status, j.requested_at, j.finished_at,
       i.label_print_job_item_id, i.unit_label_snapshot, i.lot_name_snapshot,
       i.template_name_snapshot, i.copies_requested, i.copies_queued, i.status AS item_status,
       i.failure_message AS item_failure_message,
       a.label_print_attempt_id, a.attempt_number, a.printer_label_snapshot,
       a.printer_location_snapshot, a.cups_queue_snapshot, a.copies_submitted,
       a.status AS attempt_status, a.started_at AS attempt_started_at,
       a.finished_at AS attempt_finished_at, a.failure_message AS attempt_failure_message
     FROM label_print_sets s
     LEFT JOIN label_print_jobs j ON j.label_print_set_id = s.label_print_set_id
     LEFT JOIN label_print_job_items i ON i.label_print_job_id = j.label_print_job_id
     LEFT JOIN label_print_attempts a ON a.label_print_job_item_id = i.label_print_job_item_id
     WHERE s.actor_user_id = ?
       AND s.last_activity_at >= DATE_SUB(CURRENT_TIMESTAMP(6), INTERVAL ? MINUTE)
     ORDER BY s.last_activity_at DESC, s.label_print_set_id DESC,
              j.requested_at ASC, j.label_print_job_id ASC,
              i.label_print_job_item_id ASC, a.attempt_number ASC`,
    [actorId, safeMinutes]
  );

  const sets = [];
  const setMap = new Map();
  const jobMap = new Map();
  const itemMap = new Map();

  for (const row of rows) {
    const setId = Number(row.label_print_set_id);
    if (!setMap.has(setId)) {
      const set = {
        setId,
        groupingKind: row.grouping_kind,
        startedAt: row.started_at,
        lastActivityAt: row.last_activity_at,
        jobs: []
      };
      setMap.set(setId, set);
      sets.push(set);
    }
    if (!row.label_print_job_id) continue;
    const jobId = Number(row.label_print_job_id);
    if (!jobMap.has(jobId)) {
      const job = {
        jobId,
        source: row.source,
        status: row.job_status,
        requestedAt: row.requested_at,
        finishedAt: row.finished_at,
        items: []
      };
      jobMap.set(jobId, job);
      setMap.get(setId).jobs.push(job);
    }
    if (!row.label_print_job_item_id) continue;
    const itemId = Number(row.label_print_job_item_id);
    if (!itemMap.has(itemId)) {
      const item = {
        itemId,
        unitLabel: row.unit_label_snapshot,
        lotName: row.lot_name_snapshot,
        templateName: row.template_name_snapshot,
        copiesRequested: Number(row.copies_requested || 0),
        copiesQueued: Number(row.copies_queued || 0),
        status: row.item_status,
        failureMessage: row.item_failure_message,
        attempts: []
      };
      itemMap.set(itemId, item);
      jobMap.get(jobId).items.push(item);
    }
    if (row.label_print_attempt_id) {
      itemMap.get(itemId).attempts.push({
        attemptId: Number(row.label_print_attempt_id),
        attemptNumber: Number(row.attempt_number || 0),
        printerLabel: row.printer_label_snapshot,
        printerLocation: row.printer_location_snapshot,
        cupsQueue: row.cups_queue_snapshot,
        copiesSubmitted: Number(row.copies_submitted || 0),
        status: row.attempt_status,
        startedAt: row.attempt_started_at,
        finishedAt: row.attempt_finished_at,
        failureMessage: row.attempt_failure_message
      });
    }
  }

  return sets;
}

module.exports = {
  beginPrintJob,
  createPrintJobItem,
  beginPrintAttempt,
  completePrintAttempt,
  completePrintItem,
  completePrintJob,
  listRecentQueuedAttempts,
  reconcilePrintAttemptStatus,
  getRecentPrintSummary,
  listRecentPrintSets
};
