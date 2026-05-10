const portalDefinitions = {
  management: {
    slug: 'management',
    title: 'Management Portal',
    eyebrow: 'Operations leadership',
    summary: 'Manage technicians, compare productivity, and monitor project throughput across locations.',
    primaryMetric: 'Technician productivity',
    tables: ['employees', 'lots', 'projects', 'units', 'technician_unit_events'],
    actions: [
      'Review active technician workload and completion rates.',
      'Compare units processed by project, lot, and location.',
      'Identify bottlenecks using daily and weekly productivity charts.'
    ],
    enhancements: [
      'Technician scorecards with quality, speed, and rework metrics.',
      'Manager alerts when a lot or project falls behind target pace.',
      'Role-based approvals for employee status and assignment changes.'
    ]
  },
  tech: {
    slug: 'tech',
    title: 'Tech Portal',
    eyebrow: 'Individual technician workspace',
    summary: 'Give each technician a focused view of assigned units, progress, and personal productivity trends.',
    primaryMetric: 'Assigned units in progress',
    tables: ['employees', 'units', 'units_has_techs', 'technician_unit_events'],
    actions: [
      'View current assignments and required next steps.',
      'Record unit status changes, notes, and completed work.',
      'Track personal daily, weekly, and monthly productivity.'
    ],
    enhancements: [
      'Barcode or serial-number lookup for fast unit check-in.',
      'Personal goals with streaks and progress milestones.',
      'Issue escalation flow for iCloud, MDM, parts, or QA blockers.'
    ]
  },
  warehouse: {
    slug: 'warehouse',
    title: 'Warehouse Portal',
    eyebrow: 'Inventory and location control',
    summary: 'Track inventory quantities, warehouse locations, rack/bin positions, and unit movement status.',
    primaryMetric: 'Inventory by location',
    tables: ['locations', 'inventory', 'warehouse_zones', 'warehouse_racks', 'inventory_movements'],
    actions: [
      'Search inventory by type, vendor, location, rack, or status.',
      'Move inventory between racks, bins, lots, and locations.',
      'Maintain receiving, picking, staging, and shipping workflows.'
    ],
    enhancements: [
      'Rack maps with capacity and occupancy indicators.',
      'Cycle-count queues and inventory discrepancy tracking.',
      'Low-stock alerts and vendor replenishment reporting.'
    ]
  },
  sales: {
    slug: 'sales',
    title: 'Sales Portal',
    eyebrow: 'Customer and sellable inventory view',
    summary: 'Help sales team members track customers, opportunities, sales activity, and available inventory.',
    primaryMetric: 'Sellable inventory pipeline',
    tables: ['customers', 'sales_opportunities', 'sales_orders', 'units', 'inventory'],
    actions: [
      'View sellable units and inventory reserved for customers.',
      'Track customers, opportunities, quotes, and order status.',
      'Coordinate with warehouse availability before committing stock.'
    ],
    enhancements: [
      'Customer-specific pricing and quote generation.',
      'Inventory reservation workflow with expiration dates.',
      'Sales funnel charts by stage, representative, and expected close date.'
    ]
  }
};

function getPortalList() {
  return Object.values(portalDefinitions);
}

function getPortalDefinition(slug) {
  return portalDefinitions[slug] || null;
}

module.exports = {
  getPortalList,
  getPortalDefinition
};
