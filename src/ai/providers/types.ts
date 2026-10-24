export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  provider: 'ollama' | 'cloud' | 'deterministic';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costUsd?: number;
}

export interface ILLMProvider {
  readonly name: string;
  readonly isLocal: boolean;
  isAvailable(): Promise<boolean>;
  chat(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult>;
  generateEmbedding(text: string): Promise<number[]>;
}
