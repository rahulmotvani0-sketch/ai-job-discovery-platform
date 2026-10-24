import { randomUUID } from 'node:crypto';
import { logger } from '../../core/logger.js';
import type { DatabaseManager } from '../../core/database.js';
import type { LLMConfiguration } from '../../types/index.js';

export interface MaskedLLMConfig {
  id: string;
  provider: string;
  endpoint?: string;
  maskedApiKey: string;
  hasApiKey: boolean;
  availableModels: string[];
  defaultModel: string;
  requestTimeoutMs: number;
  maxOutputTokens: number;
  isEnabled: boolean;
  taskPreferences: Record<string, string>;
  lastTestStatus?: 'SUCCESS' | 'AUTH_FAILED' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'ERROR';
  lastTestAt?: string;
  lastError?: string;
  totalTokensUsed: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionTestResult {
  provider: string;
  status: 'SUCCESS' | 'AUTH_FAILED' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'ERROR';
  latencyMs: number;
  message: string;
  modelTested: string;
}

export class CloudConfigManager {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
    this.seedDefaultProvidersIfEmpty();
  }

  private seedDefaultProvidersIfEmpty() {
    const existing = this.db.getLLMConfigurations();
    if (existing.length === 0) {
      // Seed Ollama local default
      this.db.saveLLMConfiguration({
        id: randomUUID(),
        provider: 'ollama',
        endpoint: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
        apiKey: undefined,
        availableModels: ['llama3.2:3b', 'llama3.1:8b', 'mistral', 'qwen2.5:3b'],
        defaultModel: 'llama3.2:3b',
        requestTimeoutMs: 30000,
        maxOutputTokens: 2048,
        isEnabled: true,
        taskPreferences: {
          'job_extraction': 'llama3.2:3b',
          'resume_sensitive_parsing': 'llama3.2:3b'
        },
        totalTokensUsed: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Seed OpenAI template
      this.db.saveLLMConfiguration({
        id: randomUUID(),
        provider: 'openai',
        endpoint: 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY || undefined,
        availableModels: ['gpt-4o', 'gpt-4o-mini', 'o1-mini'],
        defaultModel: 'gpt-4o-mini',
        requestTimeoutMs: 45000,
        maxOutputTokens: 4096,
        isEnabled: !!process.env.OPENAI_API_KEY,
        taskPreferences: {
          'resume_tailoring': 'gpt-4o',
          'complex_analysis': 'gpt-4o'
        },
        totalTokensUsed: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Seed Gemini template
      this.db.saveLLMConfiguration({
        id: randomUUID(),
        provider: 'gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: process.env.GEMINI_API_KEY || undefined,
        availableModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'],
        defaultModel: 'gemini-2.5-flash',
        requestTimeoutMs: 45000,
        maxOutputTokens: 4096,
        isEnabled: !!process.env.GEMINI_API_KEY,
        taskPreferences: {
          'resume_tailoring': 'gemini-2.5-pro',
          'match_scoring': 'gemini-2.5-flash'
        },
        totalTokensUsed: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Seed Anthropic template
      this.db.saveLLMConfiguration({
        id: randomUUID(),
        provider: 'anthropic',
        endpoint: 'https://api.anthropic.com/v1',
        apiKey: process.env.ANTHROPIC_API_KEY || undefined,
        availableModels: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
        defaultModel: 'claude-3-5-haiku-20241022',
        requestTimeoutMs: 45000,
        maxOutputTokens: 4096,
        isEnabled: !!process.env.ANTHROPIC_API_KEY,
        taskPreferences: {
          'resume_tailoring': 'claude-3-5-sonnet-20241022'
        },
        totalTokensUsed: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Helper to mask an API key for safe display (e.g. sk-proj-...3bA1)
   */
  maskKey(key?: string): string {
    if (!key || key.length < 8) return '';
    return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
  }

  /**
   * Returns list of configured providers with keys securely masked.
   */
  listMaskedConfigs(): MaskedLLMConfig[] {
    const configs = this.db.getLLMConfigurations();
    return configs.map(c => ({
      id: c.id,
      provider: c.provider,
      endpoint: c.endpoint,
      maskedApiKey: this.maskKey(c.apiKey),
      hasApiKey: !!c.apiKey && c.apiKey.trim().length > 0,
      availableModels: c.availableModels,
      defaultModel: c.defaultModel,
      requestTimeoutMs: c.requestTimeoutMs,
      maxOutputTokens: c.maxOutputTokens,
      isEnabled: c.isEnabled,
      taskPreferences: c.taskPreferences || {},
      lastTestStatus: c.lastTestStatus,
      lastTestAt: c.lastTestAt,
      lastError: c.lastError,
      totalTokensUsed: c.totalTokensUsed,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  /**
   * Saves or updates a provider configuration.
   */
  saveConfig(params: {
    provider: 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'ollama' | 'custom';
    endpoint?: string;
    apiKey?: string;
    defaultModel: string;
    availableModels?: string[];
    requestTimeoutMs?: number;
    maxOutputTokens?: number;
    isEnabled?: boolean;
    taskPreferences?: Record<string, string>;
  }): MaskedLLMConfig {
    const existing = this.db.getLLMConfigurationByProvider(params.provider);
    const id = existing?.id || randomUUID();

    // If apiKey is omitted or looks like masked string, retain existing key
    let finalApiKey = params.apiKey;
    if (!finalApiKey || finalApiKey.includes('••••')) {
      finalApiKey = existing?.apiKey;
    }

    const config: LLMConfiguration = {
      id,
      provider: params.provider,
      endpoint: params.endpoint || existing?.endpoint,
      apiKey: finalApiKey,
      availableModels: params.availableModels || existing?.availableModels || [params.defaultModel],
      defaultModel: params.defaultModel,
      requestTimeoutMs: params.requestTimeoutMs ?? existing?.requestTimeoutMs ?? 30000,
      maxOutputTokens: params.maxOutputTokens ?? existing?.maxOutputTokens ?? 4096,
      isEnabled: params.isEnabled !== undefined ? params.isEnabled : (existing?.isEnabled ?? true),
      taskPreferences: params.taskPreferences || existing?.taskPreferences || {},
      lastTestStatus: existing?.lastTestStatus,
      lastTestAt: existing?.lastTestAt,
      lastError: existing?.lastError,
      totalTokensUsed: existing?.totalTokensUsed || 0,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.db.saveLLMConfiguration(config);
    this.db.recordAuditEvent('LLM_CONFIG_UPDATED', 'user', 'LLM_CONFIG', params.provider, {
      defaultModel: config.defaultModel,
      isEnabled: config.isEnabled,
      endpoint: config.endpoint,
    });

    logger.info(`LLM Provider configuration saved for '${params.provider}' (model: ${config.defaultModel})`);
    return {
      id: config.id,
      provider: config.provider,
      endpoint: config.endpoint,
      maskedApiKey: this.maskKey(config.apiKey),
      hasApiKey: !!config.apiKey && config.apiKey.length > 0,
      availableModels: config.availableModels,
      defaultModel: config.defaultModel,
      requestTimeoutMs: config.requestTimeoutMs,
      maxOutputTokens: config.maxOutputTokens,
      isEnabled: config.isEnabled,
      taskPreferences: config.taskPreferences || {},
      lastTestStatus: config.lastTestStatus,
      lastTestAt: config.lastTestAt,
      lastError: config.lastError,
      totalTokensUsed: config.totalTokensUsed,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * Live test a provider connection without leaking keys or throwing uncaught exceptions.
   */
  async testProvider(providerName: string): Promise<ConnectionTestResult> {
    const config = this.db.getLLMConfigurationByProvider(providerName);
    if (!config) {
      return {
        provider: providerName,
        status: 'UNAVAILABLE',
        latencyMs: 0,
        message: `Provider '${providerName}' is not configured`,
        modelTested: 'none'
      };
    }

    const start = Date.now();
    try {
      if (providerName === 'ollama') {
        const endpoint = config.endpoint || 'http://127.0.0.1:11434';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        
        try {
          const resp = await fetch(`${endpoint}/api/tags`, { signal: controller.signal });
          clearTimeout(timeout);
          const latencyMs = Date.now() - start;
          if (resp.ok) {
            const data = await resp.json() as any;
            const models = Array.isArray(data.models) ? data.models.map((m: any) => m.name) : [];
            const hasModel = models.some((m: string) => m.startsWith(config.defaultModel.split(':')[0]));
            const msg = hasModel 
              ? `Connected. Model '${config.defaultModel}' available.` 
              : `Connected. Available local models: ${models.slice(0, 3).join(', ') || 'none'}`;
            this.db.updateLLMTestResult(providerName, 'SUCCESS');
            return { provider: providerName, status: 'SUCCESS', latencyMs, message: msg, modelTested: config.defaultModel };
          }
          throw new Error(`HTTP ${resp.status}`);
        } catch (e: any) {
          clearTimeout(timeout);
          this.db.updateLLMTestResult(providerName, 'UNAVAILABLE', e.message);
          return { provider: providerName, status: 'UNAVAILABLE', latencyMs: Date.now() - start, message: `Local Ollama service not reachable: ${e.message}`, modelTested: config.defaultModel };
        }
      }

      // Cloud Providers requiring API Key
      if (!config.apiKey || config.apiKey.trim().length === 0) {
        this.db.updateLLMTestResult(providerName, 'AUTH_FAILED', 'API key is missing');
        return {
          provider: providerName,
          status: 'AUTH_FAILED',
          latencyMs: 0,
          message: 'API key is missing. Please provide a valid key.',
          modelTested: config.defaultModel
        };
      }

      // Test OpenAI-compatible
      if (providerName === 'openai' || providerName === 'openrouter') {
        const baseUrl = config.endpoint || (providerName === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1');
        const resp = await fetch(`${baseUrl}/models`, {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        const latencyMs = Date.now() - start;
        if (resp.status === 401 || resp.status === 403) {
          this.db.updateLLMTestResult(providerName, 'AUTH_FAILED', `Status ${resp.status}: Unauthorized`);
          return { provider: providerName, status: 'AUTH_FAILED', latencyMs, message: 'Authentication failed. Invalid API key.', modelTested: config.defaultModel };
        }
        if (resp.status === 429) {
          this.db.updateLLMTestResult(providerName, 'RATE_LIMITED', 'Status 429: Rate limited or quota exceeded');
          return { provider: providerName, status: 'RATE_LIMITED', latencyMs, message: 'Rate limited or quota exceeded.', modelTested: config.defaultModel };
        }
        if (resp.ok) {
          this.db.updateLLMTestResult(providerName, 'SUCCESS');
          return { provider: providerName, status: 'SUCCESS', latencyMs, message: `Connection verified in ${latencyMs}ms.`, modelTested: config.defaultModel };
        }
        this.db.updateLLMTestResult(providerName, 'ERROR', `Status ${resp.status}`);
        return { provider: providerName, status: 'ERROR', latencyMs, message: `Request returned HTTP ${resp.status}`, modelTested: config.defaultModel };
      }

      // Test Gemini
      if (providerName === 'gemini') {
        const baseUrl = config.endpoint || 'https://generativelanguage.googleapis.com/v1beta';
        const resp = await fetch(`${baseUrl}/models?key=${config.apiKey}`);
        const latencyMs = Date.now() - start;
        if (resp.status === 400 || resp.status === 403) {
          this.db.updateLLMTestResult(providerName, 'AUTH_FAILED', 'Invalid Gemini API key');
          return { provider: providerName, status: 'AUTH_FAILED', latencyMs, message: 'Invalid Gemini API key.', modelTested: config.defaultModel };
        }
        if (resp.ok) {
          this.db.updateLLMTestResult(providerName, 'SUCCESS');
          return { provider: providerName, status: 'SUCCESS', latencyMs, message: `Gemini API verified in ${latencyMs}ms.`, modelTested: config.defaultModel };
        }
        this.db.updateLLMTestResult(providerName, 'ERROR', `HTTP ${resp.status}`);
        return { provider: providerName, status: 'ERROR', latencyMs, message: `Gemini returned HTTP ${resp.status}`, modelTested: config.defaultModel };
      }

      // Test Anthropic
      if (providerName === 'anthropic') {
        const resp = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01'
          }
        });
        const latencyMs = Date.now() - start;
        if (resp.status === 401 || resp.status === 403) {
          this.db.updateLLMTestResult(providerName, 'AUTH_FAILED', 'Invalid Anthropic API key');
          return { provider: providerName, status: 'AUTH_FAILED', latencyMs, message: 'Invalid Anthropic API key.', modelTested: config.defaultModel };
        }
        if (resp.ok) {
          this.db.updateLLMTestResult(providerName, 'SUCCESS');
          return { provider: providerName, status: 'SUCCESS', latencyMs, message: `Anthropic API verified in ${latencyMs}ms.`, modelTested: config.defaultModel };
        }
        this.db.updateLLMTestResult(providerName, 'ERROR', `HTTP ${resp.status}`);
        return { provider: providerName, status: 'ERROR', latencyMs, message: `Anthropic returned HTTP ${resp.status}`, modelTested: config.defaultModel };
      }

      return {
        provider: providerName,
        status: 'SUCCESS',
        latencyMs: Date.now() - start,
        message: 'Configured and ready.',
        modelTested: config.defaultModel
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      this.db.updateLLMTestResult(providerName, 'ERROR', err.message);
      return {
        provider: providerName,
        status: 'ERROR',
        latencyMs,
        message: `Connection error: ${err.message}`,
        modelTested: config.defaultModel
      };
    }
  }
}
