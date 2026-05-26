# BWTDallas App

Internal operations portal for Bright World Technologies.

## Current Step

Step 2b: Management Lots Browser.

This step adds:

- Read-only Management Lots page
- Lot summary cards
- Lot unit counts
- Lot requirement counts
- Lot goal/progress display
- Management sidebar link for Lots

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

## Important URLs

```text
https://bwtdallas.com/
https://bwtdallas.com/login
https://bwtdallas.com/management/users
https://bwtdallas.com/management/users/new
https://bwtdallas.com/management/config
https://bwtdallas.com/management/lots
https://bwtdallas.com/database
https://bwtdallas.com/api/health