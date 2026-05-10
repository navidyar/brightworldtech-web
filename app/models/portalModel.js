const pool = require('../db/pool');

const EMPTY_SUMMARY = {
  employees: 0,
  activeTechnicians: 0,
  locations: 0,
  lots: 0,
  projects: 0,
  units: 0,
  inventoryRecords: 0,
  inventoryQuantity: 0
};

async function safeSingleRow(sql, fallback = {}) {
  try {
    const [rows] = await pool.execute(sql);
    return rows[0] || fallback;
  } catch (error) {
    return fallback;
  }
}

async function safeRows(sql, fallback = []) {
  try {
    const [rows] = await pool.execute(sql);
    return rows;
  } catch (error) {
    return fallback;
  }
}

async function getPortalSummary() {
  return safeSingleRow(
    `
    SELECT
      (SELECT COUNT(*) FROM employees) AS employees,
      (SELECT COUNT(*) FROM employees WHERE employment_status = 1 AND role LIKE '%tech%') AS activeTechnicians,
      (SELECT COUNT(*) FROM locations) AS locations,
      (SELECT COUNT(*) FROM lots) AS lots,
      (SELECT COUNT(*) FROM projects) AS projects,
      (SELECT COUNT(*) FROM units) AS units,
      (SELECT COUNT(*) FROM inventory) AS inventoryRecords,
      (SELECT COALESCE(SUM(amount), 0) FROM inventory) AS inventoryQuantity
    `,
    EMPTY_SUMMARY
  );
}

async function getManagementSnapshot() {
  const [summary, technicianWorkload, projectMix] = await Promise.all([
    getPortalSummary(),
    safeRows(
      `
      SELECT
        e.id,
        CONCAT(e.first_name, ' ', e.last_name) AS name,
        COUNT(uht.units_id) AS assignedUnits
      FROM employees e
      LEFT JOIN units_has_techs uht ON uht.techs_id = e.id
      WHERE e.role LIKE '%tech%'
      GROUP BY e.id, e.first_name, e.last_name
      ORDER BY assignedUnits DESC, name ASC
      LIMIT 8
      `
    ),
    safeRows(
      `
      SELECT
        p.name,
        COUNT(u.id) AS unitCount
      FROM projects p
      LEFT JOIN units u ON u.projects_id = p.id
      GROUP BY p.id, p.name
      ORDER BY unitCount DESC, p.name ASC
      LIMIT 8
      `
    )
  ]);

  return {
    summary,
    technicianWorkload,
    projectMix
  };
}

async function getTechSnapshot() {
  const [summary, statusMix, recentAssignments] = await Promise.all([
    getPortalSummary(),
    safeRows(
      `
      SELECT
        COALESCE(u.icloud_status, 'Unknown') AS label,
        COUNT(*) AS value
      FROM units u
      GROUP BY COALESCE(u.icloud_status, 'Unknown')
      ORDER BY value DESC, label ASC
      LIMIT 6
      `
    ),
    safeRows(
      `
      SELECT
        u.id,
        u.unit_serial,
        u.unit_type,
        CONCAT(e.first_name, ' ', e.last_name) AS technician
      FROM units_has_techs uht
      INNER JOIN units u ON u.id = uht.units_id AND u.projects_id = uht.units_projects_id
      INNER JOIN employees e ON e.id = uht.techs_id
      ORDER BY uht.created DESC, uht.units_id DESC
      LIMIT 8
      `
    )
  ]);

  return {
    summary,
    statusMix,
    recentAssignments
  };
}

async function getWarehouseSnapshot() {
  const [summary, locationInventory, vendorInventory] = await Promise.all([
    getPortalSummary(),
    safeRows(
      `
      SELECT
        l.name,
        COALESCE(SUM(i.amount), 0) AS quantity
      FROM locations l
      LEFT JOIN inventory i ON i.locations_id = l.id
      GROUP BY l.id, l.name
      ORDER BY quantity DESC, l.name ASC
      LIMIT 8
      `
    ),
    safeRows(
      `
      SELECT
        COALESCE(vendor, 'Unknown') AS label,
        COALESCE(SUM(amount), 0) AS value
      FROM inventory
      GROUP BY COALESCE(vendor, 'Unknown')
      ORDER BY value DESC, label ASC
      LIMIT 8
      `
    )
  ]);

  return {
    summary,
    locationInventory,
    vendorInventory
  };
}

async function getSalesSnapshot() {
  const [summary, sellableMix, recentUnits] = await Promise.all([
    getPortalSummary(),
    safeRows(
      `
      SELECT
        COALESCE(unit_type, 'Unknown') AS label,
        COUNT(*) AS value
      FROM units
      GROUP BY COALESCE(unit_type, 'Unknown')
      ORDER BY value DESC, label ASC
      LIMIT 8
      `
    ),
    safeRows(
      `
      SELECT
        id,
        unit_type,
        unit_serial,
        model_number,
        color
      FROM units
      ORDER BY created DESC, id DESC
      LIMIT 8
      `
    )
  ]);

  return {
    summary,
    sellableMix,
    recentUnits
  };
}

module.exports = {
  getPortalSummary,
  getManagementSnapshot,
  getTechSnapshot,
  getWarehouseSnapshot,
  getSalesSnapshot
};
