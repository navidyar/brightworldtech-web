# brightworldtech

Express + EJS + MySQL application shell for the BWTDallas operational portals.

## Portal direction

The earlier item list is treated as a throwaway database connectivity test. The app now starts from a department portal hub and scaffolds views for:

- **Management Portal** — technician management, productivity, project throughput, and chart-ready summaries.
- **Tech Portal** — individual technician assignments, unit progress, and personal productivity.
- **Warehouse Portal** — inventory quantities, warehouse locations, rack/bin tracking, and movement workflows.
- **Sales Portal** — customer activity, sellable inventory, quotes, reservations, and order tracking.

## Database direction

`app/sql/schema.sql` contains a cleaned MySQL schema based on the provided Workbench draft. It keeps the core tables from the diagram and adds history tables that portals will need for accurate reporting:

- `technician_unit_events` for technician productivity and status-change charts.
- `warehouse_zones`, `warehouse_racks`, and `inventory_movements` for rack/bin and warehouse movement tracking.
- `customers`, `sales_opportunities`, and `sales_orders` for the sales portal.
- `config_categories` and `config_values` for configurable statuses and dropdown values.
