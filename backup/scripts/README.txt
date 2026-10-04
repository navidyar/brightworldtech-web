BWTDallas Backup / Recovery Runbook
===================================

Application:
/home/bwtdallas-webserver/app

Backup output:
/home/bwtdallas-webserver/app/backup

Create Full + Purge backups
---------------------------
cd /home/bwtdallas-webserver/app
./backup/scripts/bwtdallas-backup.sh

Defaults:
- creates Backup-YYYY-MM-DD-HHMMSS.zip
- creates Purge-YYYY-MM-DD-HHMMSS.zip
- creates a .sha256 sidecar for each ZIP
- verifies the production logical dump by restoring it into a temporary database
- verifies Purge state before exporting
- validates inner SHA-256 manifests and ZIP integrity
- keeps the newest 2 Full and newest 2 Purge archives locally
- requires at least 2048 MB free before starting

Optional overrides:
KEEP_BACKUPS=1 ./backup/scripts/bwtdallas-backup.sh
MIN_FREE_MB=3072 ./backup/scripts/bwtdallas-backup.sh

Verify an archive
-----------------
./backup/scripts/bwtdallas-verify-backup.sh backup/Backup-YYYY-MM-DD-HHMMSS.zip
./backup/scripts/bwtdallas-verify-backup.sh backup/Purge-YYYY-MM-DD-HHMMSS.zip

Full recovery
-------------
Use on a replacement/fresh host with Docker + Docker Compose available.

./backup/scripts/bwtdallas-restore.sh /path/to/Backup-YYYY-MM-DD-HHMMSS.zip --confirm-replace

The full archive contains production .env/secrets and must be protected as sensitive data.

Development bootstrap
---------------------
Use the Purge archive on a separate VPS.

./backup/scripts/bwtdallas-restore.sh /path/to/Purge-YYYY-MM-DD-HHMMSS.zip --development

Development mode:
- does not include production .env
- generates fresh DB/session/tool secrets
- keeps global configuration/catalog data and label templates/assets
- keeps one Super Admin user
- contains zero Units and zero Lots
- disables Traefik routing from the production compose labels
- exposes app on 127.0.0.1:3000
- exposes phpMyAdmin on 127.0.0.1:8081

Current Purge policy
--------------------
Retained:
- schema
- global configuration/system configuration
- roles, permissions and role permissions
- manufacturers / processor / unit-model catalogs
- model intake mappings / model processor options
- label templates, assets and dynamic field configuration
- label print settings
- Super Admin user and that user's role assignments/permission overrides

Purged:
- Lots and all Lot-specific settings
- Units and all operational Unit history/spec/QC/tool/request data
- sessions/login/password-link/user-management activity
- all users except Super Admin
- Virtual Huddle history
- print jobs/history
- printer registrations/groups
- operational usage/ranking data
- permission audit history

Dev / Prod Git synchronization
------------------------------
Not enabled yet.

Production currently tracks:
origin = https://github.com/navidyar/brightworldtech-web.git
branch = main

The live production worktree currently contains many uncommitted application changes.
Do not automate git pull/push/deployment until those changes are reconciled into Git.

Target flow after reconciliation:
- main = Production
- develop = Development integration
- feature/* = isolated development changes
- hotfix/* = urgent production fixes
- Dev -> Prod through reviewed merge into main
- Prod hotfix -> merge back into develop
- database changes flow through versioned migrations, never by copying the Dev DB over Prod
- production operational data never flows into Dev except through a Purge archive

Nightly scheduling
------------------
Not enabled yet. Choose the desired nightly clock time first.
The script is ready for cron/systemd/GitHub Actions once scheduling and offsite destination are selected.

Nightly systemd automation
--------------------------
Portable unit templates are stored under backup/scripts/systemd/.

Install/update the units:
  cp backup/scripts/systemd/bwtdallas-backup.service /etc/systemd/system/
  cp backup/scripts/systemd/bwtdallas-backup.timer /etc/systemd/system/
  systemctl daemon-reload

The supplied timer is intentionally not enabled automatically.
Its default schedule is 03:00 America/Chicago and follows daylight-saving time.

Review schedule:
  systemd-analyze calendar '*-*-* 03:00:00 America/Chicago'

Enable when approved:
  systemctl enable --now bwtdallas-backup.timer

Check schedule/status:
  systemctl list-timers bwtdallas-backup.timer
  systemctl status bwtdallas-backup.timer

Run immediately without waiting for the timer:
  systemctl start bwtdallas-backup.service

Review backup logs:
  journalctl -u bwtdallas-backup.service

The service uses flock so a second scheduled/manual backup cannot overlap an active run.
