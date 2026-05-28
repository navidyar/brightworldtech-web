# BWTDallas App

Internal operations portal for Bright World Technologies.

## Current Step

Step 2i: Tech Unit Creation / Editing Foundation.

This step adds the first Tech unit workflow:

- Tech Unit Browser
- Create Unit page
- Edit Unit page
- Dynamic mapping to existing `units` table columns
- Lot assignment support when `units.lot_id` exists
- Standardized dropdowns when matching config values exist
- Manual fallback text fields when config values are not available yet

Routes added:

```text
GET  /tech/units
GET  /tech/units/new
POST /tech/units
GET  /tech/units/:unitId/edit
POST /tech/units/:unitId