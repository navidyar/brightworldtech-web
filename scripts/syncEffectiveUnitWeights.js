'use strict';

require('dotenv').config();

const { pool } = require('../models/db');
const productionWeightSyncModel = require('../models/productionWeightSyncModel');

const APPLY = process.argv.includes('--apply');
const JSON_OUTPUT = process.argv.includes('--json');

function buildReport(result) {
  return {
    mode: APPLY ? 'apply' : 'dry-run',
    ready: Boolean(result.ready),
    reason: result.reason || '',
    unitsScanned: Number(result.unitsScanned || 0),
    activeManualCompletionsScanned: Number(result.completionsScanned || 0),
    mismatchedCompletionRows: Array.isArray(result.updates) ? result.updates.length : 0,
    updatedCompletionRows: Number(result.affectedRows || 0),
    unresolvedUnits: Array.isArray(result.unresolvedUnits) ? result.unresolvedUnits : [],
    changes: Array.isArray(result.updates) ? result.updates : []
  };
}

function printReport(report) {
  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Mode: ${report.mode}`);
  console.log(`Weight sync ready: ${report.ready ? 'yes' : 'no'}`);
  if (report.reason) console.log(`Reason: ${report.reason}`);
  console.log(`Units scanned: ${report.unitsScanned}`);
  console.log(`Active manual completion rows scanned: ${report.activeManualCompletionsScanned}`);
  console.log(`Completion rows with stale weights: ${report.mismatchedCompletionRows}`);
  console.log(`Completion rows updated: ${report.updatedCompletionRows}`);
  console.log(`Units without a resolvable effective weight: ${report.unresolvedUnits.length}`);

  if (report.changes.length > 0) {
    console.log('\nPlanned weight changes:');
    for (const change of report.changes.slice(0, 100)) {
      console.log(
        `- completion ${change.completionId}, unit ${change.unitId}: ${change.previousWeight ?? '—'} -> ${change.effectiveWeight.toFixed(2)} (${change.sourceLabel})`
      );
    }
    if (report.changes.length > 100) {
      console.log(`- ... ${report.changes.length - 100} additional row(s); rerun with --json for the full report.`);
    }
  }

  if (report.unresolvedUnits.length > 0) {
    console.log('\nUnits needing a configured weight:');
    for (const unit of report.unresolvedUnits.slice(0, 100)) {
      console.log(`- unit ${unit.unitId}, lot ${unit.lotId || 'none'}: ${unit.sourceLabel || unit.sourceCode}`);
    }
  }

  if (!APPLY) {
    console.log('\nNo database changes were made. Re-run with --apply after reviewing this report.');
  }
}

async function main() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await productionWeightSyncModel.syncEffectiveManualCompletionWeights({
      connection,
      apply: APPLY
    });
    const report = buildReport(result);

    if (!report.ready) {
      await connection.rollback();
      printReport(report);
      process.exitCode = 1;
      return;
    }

    if (APPLY) {
      await connection.commit();
    } else {
      await connection.rollback();
    }

    printReport(report);
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {
      // Preserve the original error.
    }
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
