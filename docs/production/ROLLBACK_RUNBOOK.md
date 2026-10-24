# Emergency Rollback Runbook: JOB DISCOVERY AI Autonomous Platform

**Document Version:** 1.0.0  
**Generated Date:** 2026-10-24  
**Auditor:** Principal Release Manager & SRE Lead  

---

## 1. When to Initiate a Rollback

A rollback must be immediately executed if any of the following occur during or after a deployment:
1. HTTP `/health/live` or `/health/ready` fails for > 60 seconds.
2. Unhandled runtime crash loops in `journalctl -u job-platform`.
3. Database migration failure or schema incompatibility.
4. Regressed security check or unexpected external data leakage.

---

## 2. Emergency Rollback Procedure (Target Recovery Time < 3 Minutes)

### Step 1: Stop the Degraded Service
```bash
sudo systemctl stop job-platform
```

### Step 2: Roll Back Git Release Commit
Revert to the previous known stable commit:
```bash
cd /opt/job-discovery-platform

# View previous releases
git log --oneline -n 5

# Checkout the previous release commit or tag
git checkout <previous-stable-commit-hash>
```

### Step 3: Rebuild Clean Dependencies & Artifacts
```bash
npm ci
npm run build
npm test
```

### Step 4: Restore Pre-Deployment Database Snapshot (If Schema Was Altered)
```bash
# Locate the pre-deployment backup
LATEST_BACKUP=$(ls -td ./backups/* | head -n 1)
echo "Restoring from ${LATEST_BACKUP}..."
./scripts/restore.sh "${LATEST_BACKUP}"
```

### Step 5: Start Service & Verify Health
```bash
sudo systemctl start job-platform
curl -f http://127.0.0.1:3300/health/ready
```
Confirm `status: "ready"` and verify the dashboard at `http://localhost:3300/`.
