'use strict';

const { pool } = require('../models/db');
const unitQcCheckModel = require('../models/unitQcCheckModel');
const { getQcTechnicianAttributionCapabilities } = require('../models/qcTechnicianAttributionModel');
const { buildQcTechnicianAttributionSql } = require('../services/qcTechnicianAttribution');

async function main() {
  if (!await unitQcCheckModel.isQcCheckSchemaReady(pool)) {
    throw new Error('QC review storage is not ready. Run and validate the Stage 9B migration first.');
  }

  const capabilities = await getQcTechnicianAttributionCapabilities(pool);
  const attribution = buildQcTechnicianAttributionSql({ capabilities });
  const [rows] = await pool.query(
    `
      SELECT
        COUNT(*) AS review_actions,
        COUNT(DISTINCT ${attribution.expression}) AS attributed_technicians,
        COALESCE(SUM(CASE WHEN ${attribution.expression} IS NULL THEN 1 ELSE 0 END), 0) AS unattributed_actions,
        COALESCE(SUM(CASE
          WHEN ${attribution.expression} IS NOT NULL
           AND ${attribution.expression} <> completion.completed_by_user_id
          THEN 1 ELSE 0
        END), 0) AS assignment_attributed_actions
      FROM unit_qc_checks qc
      INNER JOIN unit_work_completions completion
        ON completion.unit_work_completion_id = qc.unit_work_completion_id
       AND completion.unit_id = qc.unit_id
      ${attribution.joins}
      WHERE completion.credit_source = 'manual_completion'
        AND completion.reversed_at IS NULL
    `
  );

  const result = rows[0] || {};
  const reviewActions = Number(result.review_actions || 0);
  const attributedTechnicians = Number(result.attributed_technicians || 0);
  const unattributedActions = Number(result.unattributed_actions || 0);
  const assignmentAttributedActions = Number(result.assignment_attributed_actions || 0);

  if (unattributedActions > 0) {
    throw new Error(`${unattributedActions} QC review action(s) could not be attributed to a technician.`);
  }

  console.log(
    `Stage 9H QC technician attribution valid: ${reviewActions} review action(s), `
      + `${attributedTechnicians} attributed technician(s), `
      + `${assignmentAttributedActions} action(s) assigned by Unit responsibility instead of completion recorder.`
  );
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
