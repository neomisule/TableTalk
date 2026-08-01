import type { LLMMessage, LLMResponse, LLMOptions } from '../types/index'

export interface ModelProvider {
  /**
   * Send a list of messages and get a completion back.
   *
   * @param messages - The conversation history in role/content format
   * @param options  - Optional overrides for temperature, token limit, model
   * @returns        - The LLM's response with metadata
   */
  complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>
}

// Re-export types for convenience so callers only need one import
export type { LLMMessage, LLMResponse, LLMOptions }
