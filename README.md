# BWTDallas App

Internal operations portal for Bright World Technologies.

## Current Step

Step 1d: Protected logged-in app shell.

This step adds:

- Protected Dashboard
- Protected Database Check page
- Sidebar navigation
- Topbar user display
- Logout form
- Role-aware Database Check navigation

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

## Important URLs

```text
https://bwtdallas.com/
https://bwtdallas.com/login
https://bwtdallas.com/setup-password
https://bwtdallas.com/database
https://bwtdallas.com/api/health