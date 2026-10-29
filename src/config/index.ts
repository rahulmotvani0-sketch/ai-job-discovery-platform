import { existsSync, readFileSync, chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { logger } from '../core/logger.js';

const ENV_PATH = join(process.cwd(), '.env');
const EXAMPLE_ENV_PATH = join(process.cwd(), '.env.example');

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  appMode: 'demo' | 'personal' | 'production';
  dataDir: string;
  dbPath: string;
  customResumePath?: string;
  // Local LLM
  ollamaEndpoint: string;
  ollamaModel: string;
  ollamaEmbeddingModel: string;
  ollamaTimeoutMs: number;
  // Cloud LLM
  cloudProvider: 'none' | 'openai' | 'anthropic' | 'gemini' | 'openrouter';
  cloudApiKey?: string;
  cloudBaseUrl?: string;
  cloudModel?: string;
  cloudTimeoutMs: number;
  cloudDisabled: boolean;
  // Search & Automation
  dailyTargetQualified: number;
  hourlyDiscovery: boolean;
  minMatchScore: number;
  applicationSubmissionEnabled: boolean;
  // Google Integration
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri: string;
  googleTokenPath: string;
  // Web Server
  port: number;
  host: string;
  apiAuthToken?: string;
  corsOrigin: string;
  trustProxy: boolean;
  // Instant Mobile Alerts
  telegramBotToken?: string;
  telegramChatId?: string;
  discordWebhookUrl?: string;
  alertsMinScore: number;
}

function parseInteger(val: string | undefined, defaultValue: number, min?: number, max?: number): number {
  if (val === undefined || val.trim() === '') return defaultValue;
  const parsed = parseInt(val, 10);
  if (Number.isNaN(parsed)) return defaultValue;
  if (min !== undefined && parsed < min) return min;
  if (max !== undefined && parsed > max) return max;
  return parsed;
}

export function loadConfig(customEnvPath?: string): AppConfig {
  const envFile = customEnvPath || ENV_PATH;
  if (existsSync(envFile)) {
    dotenv.config({ path: envFile });
    try {
      chmodSync(envFile, 0o600);
    } catch {
      // Ignore on filesystems without chmod
    }
  } else if (existsSync(EXAMPLE_ENV_PATH) && !customEnvPath) {
    // Copy example if .env doesn't exist yet
    try {
      const content = readFileSync(EXAMPLE_ENV_PATH, 'utf-8');
      writeFileSync(envFile, content, { mode: 0o600 });
      dotenv.config({ path: envFile });
    } catch (err) {
      logger.warn(`Could not seed default .env: ${err}`);
    }
  }

  const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
  const dbPath = process.env.DB_PATH || join(dataDir, 'job_platform.db');
  const googleTokenPath = process.env.GOOGLE_TOKEN_PATH || join(dataDir, 'google_tokens.json');

  const env = (process.env.NODE_ENV || 'development') as AppConfig['env'];
  if (!['development', 'test', 'production'].includes(env)) {
    throw new Error(`Invalid NODE_ENV: ${env}`);
  }

  const rawAppMode = process.env.APP_MODE?.trim().toLowerCase();
  const defaultMode: AppConfig['appMode'] = env === 'production' ? 'production' : (env === 'test' ? 'personal' : 'demo');
  const appMode: AppConfig['appMode'] = (rawAppMode as any) || defaultMode;
  if (!['demo', 'personal', 'production'].includes(appMode)) {
    throw new Error(`Invalid APP_MODE: ${process.env.APP_MODE}. Must be 'demo', 'personal', or 'production'.`);
  }

  // Application submission gate: strictly disabled in demo mode; requires explicit opt-in in personal/production.
  const applicationSubmissionEnabled = appMode !== 'demo' && (
    env === 'test'
      ? process.env.APPLICATION_SUBMISSION_ENABLED !== 'false'
      : process.env.APPLICATION_SUBMISSION_ENABLED === 'true'
  );
  const customResumePath = process.env.CUSTOM_RESUME_PATH?.trim() || undefined;

  const apiAuthToken = process.env.API_AUTH_TOKEN?.trim() || undefined;
  if (env === 'production' && (!apiAuthToken || apiAuthToken.length < 32)) {
    throw new Error('API_AUTH_TOKEN must be configured with at least 32 characters in production');
  }

  const rawCors = process.env.CORS_ORIGIN?.trim();
  const corsOrigin = rawCors || (env === 'production' ? '' : '*');
  if (env === 'production' && (corsOrigin === '*' || corsOrigin.includes('*'))) {
    throw new Error('Wildcard CORS is prohibited in production. Configure explicit allowed origins in CORS_ORIGIN.');
  }

  const rawPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3300;
  if (Number.isNaN(rawPort) || rawPort < 1 || rawPort > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT}. Must be between 1 and 65535.`);
  }

  const cloudProvider = (process.env.CLOUD_PROVIDER as AppConfig['cloudProvider']) || 'none';
  const cloudDisabled = process.env.CLOUD_DISABLED === 'true' || cloudProvider === 'none';
  const cloudApiKey = process.env.CLOUD_API_KEY?.trim() || undefined;
  if (!cloudDisabled && !cloudApiKey && env === 'production') {
    throw new Error(`CLOUD_API_KEY is required in production when CLOUD_PROVIDER is set to '${cloudProvider}'.`);
  }

  return {
    env,
    appMode,
    dataDir,
    dbPath,
    customResumePath,
    ollamaEndpoint: process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
    ollamaEmbeddingModel: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text:latest',
    ollamaTimeoutMs: parseInteger(process.env.OLLAMA_TIMEOUT_MS, 60000, 1000),
    cloudProvider,
    cloudApiKey,
    cloudBaseUrl: process.env.CLOUD_BASE_URL,
    cloudModel: process.env.CLOUD_MODEL || 'gpt-4o-mini',
    cloudTimeoutMs: parseInteger(process.env.CLOUD_TIMEOUT_MS, 30000, 1000),
    cloudDisabled,
    dailyTargetQualified: parseInteger(process.env.DAILY_TARGET_QUALIFIED, 10, 1),
    hourlyDiscovery: process.env.HOURLY_DISCOVERY === 'true',
    minMatchScore: parseInteger(process.env.MIN_MATCH_SCORE, 70, 0, 100),
    applicationSubmissionEnabled,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3300/oauth2callback',
    googleTokenPath,
    port: rawPort,
    host: process.env.HOST || '127.0.0.1',
    apiAuthToken,
    corsOrigin,
    trustProxy: process.env.TRUST_PROXY === 'true',
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
    alertsMinScore: parseInteger(process.env.ALERTS_MIN_SCORE, 85, 0, 100),
  };
}

export const config = loadConfig();
