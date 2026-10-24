import { logger } from '../../core/logger.js';
import type { ILLMProvider, ChatMessage, CompletionOptions, CompletionResult } from './types.js';

export class OllamaProvider implements ILLMProvider {
  readonly name = 'Ollama (Local)';
  readonly isLocal = true;

  private endpoint: string;
  private defaultModel: string;
  private embedModel: string;
  private timeoutMs: number;

  constructor(options?: { endpoint?: string; defaultModel?: string; embedModel?: string; timeoutMs?: number }) {
    this.endpoint = (options?.endpoint || process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434').replace(/\/$/, '');
    this.defaultModel = options?.defaultModel || process.env.OLLAMA_MODEL || 'qwen2.5:7b';
    this.embedModel = options?.embedModel || process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text:latest';
    this.timeoutMs = options?.timeoutMs || 60000;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const resp = await fetch(`${this.endpoint}/api/tags`, { signal: controller.signal });
      clearTimeout(timer);
      return resp.ok;
    } catch {
      return false;
    }
  }

  async chat(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult> {
    const url = `${this.endpoint}/api/chat`;
    const controller = new AbortController();
    const timeout = options?.timeoutMs || this.timeoutMs;
    const timer = setTimeout(() => controller.abort(), timeout);

    const body: Record<string, any> = {
      model: this.defaultModel,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.2,
        num_predict: options?.maxTokens ?? 2048,
      },
    };

    if (options?.jsonSchema) {
      body.format = 'json';
    }

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        throw new Error(`Ollama HTTP ${resp.status}: ${await resp.text()}`);
      }

      const data = await resp.json() as any;
      const text = data.message?.content || '';
      const promptTokens = data.prompt_eval_count || 0;
      const completionTokens = data.eval_count || 0;

      return {
        text,
        model: this.defaultModel,
        provider: 'ollama',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        costUsd: 0.0, // Local is completely free
      };
    } catch (err: any) {
      clearTimeout(timer);
      logger.warn(`Ollama request failed: ${err.message}`);
      throw err;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const url = `${this.endpoint}/api/embeddings`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embedModel,
          prompt: text,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        throw new Error(`Ollama embeddings HTTP ${resp.status}`);
      }

      const data = await resp.json() as any;
      return data.embedding || [];
    } catch (err) {
      clearTimeout(timer);
      logger.debug(`Ollama embedding generation fallback: ${err}`);
      return [];
    }
  }
}
