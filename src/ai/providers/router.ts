import { logger } from '../../core/logger.js';
import type { ILLMProvider, ChatMessage, CompletionOptions, CompletionResult } from './types.js';
import type { InferenceMode } from '../../types/index.js';
import { OllamaProvider } from './ollama.js';
import { CloudLLMProvider } from './cloud.js';
import type { DatabaseManager } from '../../core/database.js';

export type TaskType = 
  | 'JOB_EXTRACTION'
  | 'SEMANTIC_EMBEDDING'
  | 'MATCHING_EXPLANATION'
  | 'RESUME_TAILORING'
  | 'APPLICATION_EMAIL';

export class ModelRouter {
  private localProvider: OllamaProvider;
  private cloudProvider: CloudLLMProvider;
  private inferenceMode: InferenceMode;
  private db?: DatabaseManager;

  constructor(options?: { 
    local?: OllamaProvider; 
    cloud?: CloudLLMProvider; 
    inferenceMode?: InferenceMode;
    db?: DatabaseManager;
  }) {
    this.localProvider = options?.local || new OllamaProvider();
    this.cloudProvider = options?.cloud || new CloudLLMProvider();
    this.inferenceMode = options?.inferenceMode || (process.env.INFERENCE_MODE as InferenceMode) || 'hybrid';
    this.db = options?.db;
  }

  getMode(): InferenceMode {
    return this.inferenceMode;
  }

  setMode(mode: InferenceMode): void {
    this.inferenceMode = mode;
    logger.info(`Inference mode updated to: ${mode}`);
  }

  /**
   * Refreshes cloud provider settings from dynamic database configuration if available.
   */
  refreshFromConfig(): void {
    if (!this.db) return;
    const configs = this.db.getLLMConfigurations();
    const enabledCloud = configs.find(c => c.isEnabled && c.provider !== 'ollama' && c.apiKey && c.apiKey.length > 5);
    if (enabledCloud) {
      let baseUrl = enabledCloud.endpoint || 'https://api.openai.com/v1';
      if (enabledCloud.provider === 'openrouter') baseUrl = 'https://openrouter.ai/api/v1';
      this.cloudProvider = new CloudLLMProvider({
        apiKey: enabledCloud.apiKey,
        baseUrl,
        model: enabledCloud.defaultModel,
        timeoutMs: enabledCloud.requestTimeoutMs || 30000,
      });
    }
  }

  async selectProvider(task: TaskType): Promise<ILLMProvider | null> {
    this.refreshFromConfig();
    const isLocalAvailable = await this.localProvider.isAvailable();
    const isCloudAvailable = await this.cloudProvider.isAvailable();

    // Mode-based hard routing:
    if (this.inferenceMode === 'local-only') {
      return isLocalAvailable ? this.localProvider : null;
    }

    if (this.inferenceMode === 'cloud-only') {
      return isCloudAvailable ? this.cloudProvider : null;
    }

    // Hybrid Mode logic:
    // 1. Semantic Embedding: always prefer local nomic-embed-text for zero cost & low latency
    if (task === 'SEMANTIC_EMBEDDING') {
      if (isLocalAvailable) return this.localProvider;
      if (isCloudAvailable) return this.cloudProvider;
      return null;
    }

    // 2. High-precision resume tailoring & complex matching: prefer cloud if enabled and configured
    if (task === 'RESUME_TAILORING' || task === 'MATCHING_EXPLANATION') {
      if (isCloudAvailable) return this.cloudProvider;
      if (isLocalAvailable) return this.localProvider;
      return null;
    }

    // 3. Extraction & Drafting: prefer local (fast, free, private)
    if (isLocalAvailable) return this.localProvider;
    if (isCloudAvailable) return this.cloudProvider;

    return null;
  }

  async executeTask(task: TaskType, messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult | null> {
    const provider = await this.selectProvider(task);
    if (!provider) {
      logger.debug(`No active LLM provider available for ${task} in mode '${this.inferenceMode}'. Using deterministic fallback.`);
      return null;
    }

    try {
      const result = await provider.chat(messages, options);
      // Track tokens in DB if present
      if (this.db && result.usage?.totalTokens) {
        try {
          const providerKey = provider.isLocal ? 'ollama' : 'openai';
          const cfg = this.db.getLLMConfigurationByProvider(providerKey);
          if (cfg) {
            this.db.saveLLMConfiguration({
              ...cfg,
              totalTokensUsed: (cfg.totalTokensUsed || 0) + (result.usage.totalTokens || 0)
            });
          }
        } catch {}
      }
      return result;
    } catch (err: any) {
      logger.warn(`Primary provider ${provider.name} failed for ${task}: ${err.message}`);
      // In hybrid mode only, attempt alternate fallback
      if (this.inferenceMode === 'hybrid') {
        const alternate = provider.isLocal ? this.cloudProvider : this.localProvider;
        if (await alternate.isAvailable()) {
          try {
            return await alternate.chat(messages, options);
          } catch {
            return null;
          }
        }
      }
      return null;
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    if (this.inferenceMode === 'cloud-only') {
      if (await this.cloudProvider.isAvailable()) {
        return await this.cloudProvider.generateEmbedding(text);
      }
      return [];
    }

    if (await this.localProvider.isAvailable()) {
      return await this.localProvider.generateEmbedding(text);
    }
    if (this.inferenceMode === 'hybrid' && (await this.cloudProvider.isAvailable())) {
      return await this.cloudProvider.generateEmbedding(text);
    }
    return [];
  }
}
