#!/usr/bin/env bash
set -euo pipefail

# Production Database & Asset Backup Script
# JOB DISCOVERY AI Autonomous Platform

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TARGET_DIR="${BACKUP_DIR}/${TIMESTAMP}"

mkdir -p "${TARGET_DIR}"
chmod 700 "${TARGET_DIR}"

echo "[INFO] Starting backup to ${TARGET_DIR}..."

# 1. Backup SQLite Database safely (using WAL checkpoint / sqlite3 backup if available, or file copy)
DB_PATH="${DB_PATH:-./data/job_platform.db}"
if [ -f "${DB_PATH}" ]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${DB_PATH}" ".backup '${TARGET_DIR}/job_platform.db'"
    echo "[INFO] SQLite online backup completed via sqlite3 CLI."
  else
    cp "${DB_PATH}" "${TARGET_DIR}/job_platform.db"
    [ -f "${DB_PATH}-wal" ] && cp "${DB_PATH}-wal" "${TARGET_DIR}/" || true
    [ -f "${DB_PATH}-shm" ] && cp "${DB_PATH}-shm" "${TARGET_DIR}/" || true
    echo "[INFO] SQLite files copied directly."
  fi
else
  echo "[WARN] No database file found at ${DB_PATH}."
fi

# 2. Backup Generated Resumes
RESUME_DIR="${RESUME_DIR:-./data/resumes}"
if [ -d "${RESUME_DIR}" ]; then
  tar -czf "${TARGET_DIR}/resumes.tar.gz" -C "${RESUME_DIR}" .
  echo "[INFO] Resume archive saved to ${TARGET_DIR}/resumes.tar.gz."
fi

# 3. Create manifest with SHA-256 checksums
(
  cd "${TARGET_DIR}"
  sha256sum * > manifest.sha256 || true
)

echo "[SUCCESS] Backup completed successfully at ${TARGET_DIR}."
