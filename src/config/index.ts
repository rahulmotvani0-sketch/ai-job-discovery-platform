import { existsSync, readFileSync, chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { logger } from '../core/logger.js';

const ENV_PATH = join(process.cwd(), '.env');
const EXAMPLE_ENV_PATH = join(process.cwd(), '.env.example');

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  dataDir: string;
  dbPath: string;
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
  // Google Integration
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri: string;
  googleTokenPath: string;
  // Web Server
  port: number;
  host: string;
  apiAuthToken?: string;
  // Instant Mobile Alerts
  telegramBotToken?: string;
  telegramChatId?: string;
  discordWebhookUrl?: string;
  alertsMinScore: number;
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

  return {
    env: (process.env.NODE_ENV as any) || 'development',
    dataDir,
    dbPath,
    ollamaEndpoint: process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
    ollamaEmbeddingModel: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text:latest',
    ollamaTimeoutMs: parseInt(process.env.OLLAMA_TIMEOUT_MS || '60000', 10),
    cloudProvider: (process.env.CLOUD_PROVIDER as any) || 'none',
    cloudApiKey: process.env.CLOUD_API_KEY,
    cloudBaseUrl: process.env.CLOUD_BASE_URL,
    cloudModel: process.env.CLOUD_MODEL || 'gpt-4o-mini',
    cloudTimeoutMs: parseInt(process.env.CLOUD_TIMEOUT_MS || '30000', 10),
    cloudDisabled: process.env.CLOUD_DISABLED === 'true' || process.env.CLOUD_PROVIDER === 'none',
    dailyTargetQualified: parseInt(process.env.DAILY_TARGET_QUALIFIED || '10', 10),
    hourlyDiscovery: process.env.HOURLY_DISCOVERY === 'true',
    minMatchScore: parseInt(process.env.MIN_MATCH_SCORE || '70', 10),
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback',
    googleTokenPath,
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '127.0.0.1',
    apiAuthToken: process.env.API_AUTH_TOKEN,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
    alertsMinScore: parseInt(process.env.ALERTS_MIN_SCORE || '85', 10),
  };
}

export const config = loadConfig();
