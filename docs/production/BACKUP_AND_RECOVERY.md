# Backup & Disaster Recovery Guide: JOB DISCOVERY AI Autonomous Platform

**Document Version:** 1.0.0  
**Generated Date:** 2026-10-24  
**Auditor:** Principal SRE & Operations Lead  

---

## 1. Backup Strategy Overview

The platform state resides entirely within:
1. **SQLite Database:** `data/job_platform.db` (and temporary `-wal` / `-shm` write-ahead logs).
2. **Tailored Resumes:** `data/resumes/` (generated Markdown & PDF files).
3. **Environment Configuration:** `.env` (credentials and provider endpoints).

Because SQLite operates in WAL mode (`PRAGMA journal_mode = WAL;`), live backups can be taken without downtime or server shutdown using `scripts/backup.sh`.

---

## 2. Automated Backup Execution

Run the provided backup script:
```bash
./scripts/backup.sh
```
This performs:
- Online snapshot of `data/job_platform.db`.
- Compressed tarball of `data/resumes/`.
- Generation of `manifest.sha256` for integrity validation.
- Output location: `./backups/YYYYMMDD_HHMMSS/` with permissions `0700`.

### Scheduled Cron Backup (Recommended)
Add a daily cron job to create automatic nightly snapshots at 02:00 AM:
```bash
0 2 * * * /opt/job-discovery-platform/scripts/backup.sh >> /var/log/job-platform-backup.log 2>&1
```

---

## 3. Disaster Recovery & Restoration Procedure

To restore from a backup snapshot:

### Step 1: Stop Platform Service
```bash
sudo systemctl stop job-platform
```

### Step 2: Execute Restore Script
Specify the path to the backup folder:
```bash
./scripts/restore.sh ./backups/20261024_150211
```
The script will:
1. Verify SHA-256 checksums against `manifest.sha256`.
2. Restore `data/job_platform.db` with secure `0600` permissions.
3. Clean stale WAL/SHM locks.
4. Extract `resumes.tar.gz` back into `data/resumes/`.

### Step 3: Restart Platform Service & Verify Health
```bash
sudo systemctl start job-platform
curl -f http://127.0.0.1:3300/health/ready
```
Ensure the readiness probe returns HTTP 200 with `status: "ready"` and `database: "connected"`.
