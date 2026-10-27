#!/usr/bin/env node
import { existsSync, mkdirSync, accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import dotenv from 'dotenv';

console.log('[PREFLIGHT] Starting production preflight verification...');

// 1. Verify Node.js version >= 20.0.0
const [major] = process.versions.node.split('.').map(Number);
if (major < 20) {
  console.error(`[PREFLIGHT FAIL] Node.js version ${process.versions.node} is unsupported. Node.js >= 20.0.0 is required.`);
  process.exit(1);
}
console.log(`[PREFLIGHT OK] Node.js runtime version: ${process.versions.node}`);

// Load environment configuration
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';

// 2. Validate production security requirements
if (isProduction) {
  const token = process.env.API_AUTH_TOKEN?.trim();
  if (!token || token.length < 32) {
    console.error('[PREFLIGHT FAIL] Production deployment requires API_AUTH_TOKEN with at least 32 characters.');
    process.exit(1);
  }

  const cors = process.env.CORS_ORIGIN?.trim();
  if (cors === '*' || cors?.includes('*')) {
    console.error('[PREFLIGHT FAIL] Wildcard CORS is prohibited in production. Set explicit origins in CORS_ORIGIN.');
    process.exit(1);
  }

  const cloudProvider = process.env.CLOUD_PROVIDER || 'none';
  const cloudDisabled = process.env.CLOUD_DISABLED === 'true' || cloudProvider === 'none';
  if (!cloudDisabled && !process.env.CLOUD_API_KEY?.trim()) {
    console.error(`[PREFLIGHT FAIL] CLOUD_API_KEY is required in production when CLOUD_PROVIDER is '${cloudProvider}'.`);
    process.exit(1);
  }
  console.log('[PREFLIGHT OK] Production environment variables and secrets verified.');
} else {
  console.log(`[PREFLIGHT OK] Running in ${env} mode.`);
}

// 3. Verify directory access and write permissions
const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
const logDir = join(process.cwd(), 'logs');
const backupDir = join(process.cwd(), 'backups');

for (const dir of [dataDir, logDir, backupDir]) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  try {
    accessSync(dir, constants.R_OK | constants.W_OK);
  } catch (err) {
    console.error(`[PREFLIGHT FAIL] Cannot read/write to directory: ${dir}`);
    process.exit(1);
  }
}
console.log('[PREFLIGHT OK] Filesystem directories and write permissions verified.');

// 4. Verify SQLite database integrity
const dbPath = process.env.DB_PATH || join(dataDir, 'job_platform.db');
try {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000;');
  const row = db.prepare('PRAGMA integrity_check;').get();
  db.close();

  if (row?.integrity_check !== 'ok') {
    console.error(`[PREFLIGHT FAIL] Database integrity check failed on ${dbPath}: ${JSON.stringify(row)}`);
    process.exit(1);
  }
  console.log(`[PREFLIGHT OK] SQLite persistence verified healthy at ${dbPath}`);
} catch (err) {
  console.error(`[PREFLIGHT FAIL] Failed connecting to SQLite database at ${dbPath}: ${err.message}`);
  process.exit(1);
}

console.log('[PREFLIGHT SUCCESS] All operational checks passed. Ready for service startup.');
process.exit(0);
