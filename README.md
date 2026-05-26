# BWTDallas App

Internal operations portal for Bright World Technologies.

## Current Step

Step 2c.1: Create Lot Form Polish.

This step adds:

- Better Create Lot form layout
- Styled form sections
- Styled inputs, selects, and textareas
- Styled Unlimited / Open Lot checkbox card
- Browser-side hide/show behavior for Unit Amount Goal
- Removed Create Lot from the left sidebar
- Create Lot remains available as a button inside the Lots page

## Completed Steps

### Step 1a: Docker Foundation

- Docker Compose
- Node container
- MySQL container
- phpMyAdmin container
- Traefik routing
- Blank app startup

### Step 1b: Database Foundation

- MySQL connection layer
- Schema verification
- Database Check page
- Health endpoint

### Step 1c: Authentication Foundation

- Login page
- Logout route
- MySQL-backed sessions
- Argon2id password hashing
- One-time password setup links
- First admin setup-link script

### Step 1d: Logged-In Shell

- Dashboard protected by login
- Database Check protected by login and role
- Sidebar and topbar partials
- User chip and logout button

### Step 1e: Management Users

- User list
- User creation
- Role assignment
- Manual copy setup/reset links

### Step 1f: Role-Aware Navigation

- Submenus
- Role dashboards
- Role-based dashboard access
- Pastel status accents

### Step 1g: Design Polish

- Lighter pastel accents
- Solid pastel record backgrounds
- Improved submenu styling

### Step 2a: Config Browser

- Read-only config values page
- Config categories visible in Management
- Foundation for future lot/unit dropdowns

### Step 2b: Lots Browser

- Read-only lots page
- Unit count display
- Requirement count display
- Goal/progress display

### Step 2c: Create Lot Form

- Basic lot creation
- Goal or unlimited lot option
- Config-driven lot type and grade dropdowns
- Parent lot support

### Step 2c.1: Create Lot Form Polish

- Better form styling
- Unit Amount Goal hides when Unlimited / Open Lot is checked
- Cleaner left sidebar

## Next Directions

### Step 2d: Lot Requirements Foundation

Add requirement records for lots.

Planned requirements:

- RAM size
- RAM type
- SSD/storage size
- SSD/storage type
- CPU brand/model
- Touchscreen rule
- Unit type
- Manufacturer
- Model

This should use `lot_requirements` instead of adding too many columns directly to `lots`.

### Step 2e: Unit-to-Lot Validation

When a unit is added or edited, compare the unit against the selected lot requirements.

Possible validation results:

- Accepted
- Rejected by lot requirements
- Open lot / no strict validation
- Needs Management override

### Step 2f: Lot Detail Page

Create a single-lot detail page that shows:

- Lot summary
- Units inside the lot
- Requirements attached to the lot
- Progress toward goal
- Actions like edit lot, add requirements, and eventually move units

## Important URLs

```text
https://bwtdallas.com/
https://bwtdallas.com/login
https://bwtdallas.com/management/users
https://bwtdallas.com/management/users/new
https://bwtdallas.com/management/config
https://bwtdallas.com/management/lots
https://bwtdallas.com/management/lots/new
https://bwtdallas.com/database
https://bwtdallas.com/api/health