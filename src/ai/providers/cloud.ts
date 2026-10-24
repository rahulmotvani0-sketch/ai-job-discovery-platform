import { logger } from '../../core/logger.js';
import type { ILLMProvider, ChatMessage, CompletionOptions, CompletionResult } from './types.js';

export class CloudLLMProvider implements ILLMProvider {
  readonly name = 'Cloud LLM';
  readonly isLocal = false;

  private apiKey?: string;
  private baseUrl: string;
  private model: string;
  private timeoutMs: number;

  constructor(options?: { apiKey?: string; baseUrl?: string; model?: string; timeoutMs?: number }) {
    this.apiKey = options?.apiKey || process.env.CLOUD_API_KEY;
    this.baseUrl = (options?.baseUrl || process.env.CLOUD_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    this.model = options?.model || process.env.CLOUD_MODEL || 'gpt-4o-mini';
    this.timeoutMs = options?.timeoutMs || 30000;
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey && this.apiKey.length > 5);
  }

  async chat(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult> {
    if (!this.apiKey) {
      throw new Error('Cloud provider requested but CLOUD_API_KEY is not configured.');
    }

    const url = `${this.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timeout = options?.timeoutMs || this.timeoutMs;
    const timer = setTimeout(() => controller.abort(), timeout);

    const body: Record<string, any> = {
      model: this.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 2048,
    };

    if (options?.jsonSchema) {
      body.response_format = { type: 'json_object' };
    }

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        throw new Error(`Cloud LLM HTTP ${resp.status}: ${await resp.text()}`);
      }

      const data = await resp.json() as any;
      const text = data.choices?.[0]?.message?.content || '';
      const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      // Cost estimation for standard models (~$0.15/1M in, $0.60/1M out)
      const costUsd = ((usage.prompt_tokens || 0) * 0.00000015) + ((usage.completion_tokens || 0) * 0.00000060);

      return {
        text,
        model: this.model,
        provider: 'cloud',
        usage: {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
        },
        costUsd,
      };
    } catch (err: any) {
      clearTimeout(timer);
      logger.warn(`Cloud LLM call failed: ${err.message}`);
      throw err;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.apiKey) return [];
    const url = `${this.baseUrl}/embeddings`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) return [];
      const data = await resp.json() as any;
      return data.data?.[0]?.embedding || [];
    } catch {
      clearTimeout(timer);
      return [];
    }
  }
}
