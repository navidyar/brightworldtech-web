# BWTDallas App

Internal operations portal for Bright World Technologies.

## Current Step

Step 2h: Requirement Enforcement Foundation.

This step adds the enforcement decision layer for lot requirements.

Because the Tech unit creation/editing workflow has not been built yet, this step does not block real saves yet. It previews what the enforcement decision would be once the Tech workflow is connected.

This step adds:

- Enforcement summary cards
- Policy status banner
- Unit-level enforcement decisions
- Would Allow / Would Block / Needs Review / Override Needed counts
- Reusable `lotEnforcementModel.js`

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

### Step 2d: Lot Requirements Foundation

- Lot detail page
- Add requirement form
- Requirements listed per lot

### Step 2d.1: Internal Page Layout Cleanup

- Left-aligned internal pages
- Less marketing-card styling
- Smaller internal page titles
- More usable table width

### Step 2d.1a: Center Error Pages

- 404 and 500 pages centered
- Proper top padding on error pages
- Error pages separated from the normal internal page layout

### Step 2d.2: Internal Page Detail Polish

- Light blue-gray table row hover
- Cleaner table actions
- Better table readability

### Step 2d.3: Lot Tree Visibility and Dashboard Menu Cleanup

- Lot Structure tree
- Parent/child relationship visibility
- Cleaner dashboard menu behavior

### Step 2d.3a: Compact Lot Hierarchy

- Removed large Lot Tree panel
- Moved hierarchy display into the Lot Browser table
- Added child indentation and parent/child relationship labels

### Step 2d.4: Dashboard Landing Behavior Cleanup

- Dashboard landing route redirects single-dashboard users
- Dashboard landing route shows dashboard choices for multi-dashboard users
- Dashboard menu is now the main dashboard entry point

### Step 2d.5: Theme Foundation and Dark Mode Prototype

- Dark mode default
- Light/dark toggle
- Theme preference saved in browser localStorage
- Dark theme coverage for core pages

### Step 2d.6: Dual Theme Comparison

- Soft Dim Gray theme
- Hybrid Mode theme
- Light mode fallback
- Theme cycle button

### Step 2d.7: Finalize Hybrid Theme

- Hybrid mode default
- Light mode fallback
- Full dark mode postponed

### Step 2e: Unit-to-Lot Validation Engine

- Validation model added
- Lot Detail page shows validation preview
- Validation summary cards added
- Unit validation results shown in a table

### Step 2f: Standardized Requirement Dropdowns

- Requirement values can load from config values
- Dropdowns are used when standardized config values exist
- Free text remains available when no config values exist yet
- Touchscreen gets fallback Yes / No / Any options

### Step 2f.1: Password Reset, Setup-Link Copy Button, and Login Autofill Cleanup

- Password reset links for existing users
- Setup links for users without passwords
- One-time setup/reset password flow
- Copy button for setup/reset URLs
- Better browser autocomplete behavior

### Step 2g: Lot Detail Improvements

- Lot breadcrumbs
- Parent/child lot context
- Requirement pass/fail summary
- Collapsible unit validation details

### Step 2h: Requirement Enforcement Foundation

- Enforcement decision model
- Enforcement preview banner
- Unit-level enforcement decisions
- Override-needed summary

## Next Directions

### Step 2i: Tech Unit Creation / Editing Foundation

Start building the Tech Portal workflow where tech users can create or edit units and see lot validation warnings before saving.

### Step 2j: Management Override Workflow

Add override requests, approval tracking, and override reason history.

### Step 2k: Enforcement Integration

Connect the enforcement decision layer to real unit save actions.

Possible behavior:

- Allow matching units
- Warn on needs-review units
- Block rejected units
- Allow Management override
- Store override reason and approving user

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