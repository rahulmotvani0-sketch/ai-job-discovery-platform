import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseManager } from '../src/core/database.js';
import { CloudConfigManager } from '../src/ai/providers/cloud-config.js';
import { ModelRouter } from '../src/ai/providers/router.js';
import { OllamaProvider } from '../src/ai/providers/ollama.js';
import { CloudLLMProvider } from '../src/ai/providers/cloud.js';

describe('Cloud LLM Configuration & Local/Cloud Model Routing', () => {
  let db: DatabaseManager;
  let configManager: CloudConfigManager;

  beforeEach(() => {
    db = new DatabaseManager(':memory:');
    configManager = new CloudConfigManager(db);
  });

  it('masks API keys securely in configuration views', () => {
    configManager.saveConfig({
      provider: 'openai',
      apiKey: 'sk-proj-1234567890abcdef1234567890',
      defaultModel: 'gpt-4o-mini',
      availableModels: ['gpt-4o', 'gpt-4o-mini'],
      isEnabled: true,
    });

    const configs = configManager.listMaskedConfigs();
    const openai = configs.find(c => c.provider === 'openai');
    expect(openai).toBeDefined();
    expect(openai?.hasApiKey).toBe(true);
    // Key must be masked: shows prefix, bullet dots, and suffix
    expect(openai?.maskedApiKey).toContain('••••••••');
    expect(openai?.maskedApiKey).not.toContain('abcdef');
    expect(openai?.maskedApiKey.startsWith('sk-p')).toBe(true);

    // Verify raw key remains in database
    const raw = db.getLLMConfigurationByProvider('openai');
    expect(raw?.apiKey).toBe('sk-proj-1234567890abcdef1234567890');
  });

  it('preserves existing API key when update contains masked key', () => {
    configManager.saveConfig({
      provider: 'gemini',
      apiKey: 'AIzaSySecretGeminiKey12345678',
      defaultModel: 'gemini-2.5-flash',
    });

    // Client sends back masked key during update
    const updated = configManager.saveConfig({
      provider: 'gemini',
      apiKey: 'AIza••••••••5678',
      defaultModel: 'gemini-2.5-pro',
    });

    expect(updated.defaultModel).toBe('gemini-2.5-pro');
    const raw = db.getLLMConfigurationByProvider('gemini');
    // Secret should NOT be overwritten with the dots!
    expect(raw?.apiKey).toBe('AIzaSySecretGeminiKey12345678');
  });

  it('reports AUTH_FAILED when API key is missing for cloud providers', async () => {
    configManager.saveConfig({
      provider: 'anthropic',
      apiKey: '',
      defaultModel: 'claude-3-5-sonnet',
    });

    const result = await configManager.testProvider('anthropic');
    expect(result.status).toBe('AUTH_FAILED');
    expect(result.message).toContain('API key is missing');
  });

  it('enforces inference mode routing rules', async () => {
    const mockLocal = new OllamaProvider({ host: 'http://127.0.0.1:11434' });
    const mockCloud = new CloudLLMProvider({ apiKey: 'sk-test-mock-key' });

    // Mode: Local-Only
    const localRouter = new ModelRouter({
      local: mockLocal,
      cloud: mockCloud,
      inferenceMode: 'local-only',
      db,
    });
    expect(localRouter.getMode()).toBe('local-only');

    // Mode: Cloud-Only
    const cloudRouter = new ModelRouter({
      local: mockLocal,
      cloud: mockCloud,
      inferenceMode: 'cloud-only',
      db,
    });
    expect(cloudRouter.getMode()).toBe('cloud-only');

    // Mode: Hybrid
    const hybridRouter = new ModelRouter({
      local: mockLocal,
      cloud: mockCloud,
      inferenceMode: 'hybrid',
      db,
    });
    expect(hybridRouter.getMode()).toBe('hybrid');

    // Dynamic mode change
    hybridRouter.setMode('local-only');
    expect(hybridRouter.getMode()).toBe('local-only');
  });
});
