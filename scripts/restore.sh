#!/usr/bin/env bash
set -euo pipefail

# Production Database & Asset Restore Script
# JOB DISCOVERY AI Autonomous Platform

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup_directory_path>"
  echo "Example: $0 ./backups/20261024_150000"
  exit 1
fi

BACKUP_SOURCE="$1"

if [ ! -d "${BACKUP_SOURCE}" ]; then
  echo "[ERROR] Backup source directory does not exist: ${BACKUP_SOURCE}"
  exit 1
fi

echo "[INFO] Restoring from ${BACKUP_SOURCE}..."

# 1. Verify Checksums if manifest exists
if [ -f "${BACKUP_SOURCE}/manifest.sha256" ]; then
  echo "[INFO] Validating SHA-256 checksums..."
  (
    cd "${BACKUP_SOURCE}"
    sha256sum -c manifest.sha256
  )
fi

# 2. Restore Database
DB_TARGET="${DB_PATH:-./data/job_platform.db}"
mkdir -p "$(dirname "${DB_TARGET}")"

if [ -f "${BACKUP_SOURCE}/job_platform.db" ]; then
  echo "[INFO] Restoring database to ${DB_TARGET}..."
  cp "${BACKUP_SOURCE}/job_platform.db" "${DB_TARGET}"
  chmod 600 "${DB_TARGET}"
  # Clean old WAL and SHM if they exist
  rm -f "${DB_TARGET}-wal" "${DB_TARGET}-shm"
fi

# 3. Restore Resumes
RESUME_TARGET="${RESUME_DIR:-./data/resumes}"
mkdir -p "${RESUME_TARGET}"

if [ -f "${BACKUP_SOURCE}/resumes.tar.gz" ]; then
  echo "[INFO] Restoring tailored resumes to ${RESUME_TARGET}..."
  tar -xzf "${BACKUP_SOURCE}/resumes.tar.gz" -C "${RESUME_TARGET}"
fi

echo "[SUCCESS] Restore operation completed successfully."
