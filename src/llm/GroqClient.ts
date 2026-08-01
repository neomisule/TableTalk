import Groq from 'groq-sdk'
import type { ModelProvider, LLMMessage, LLMResponse, LLMOptions } from './types'
import { log } from '../utils/logger'
import { stripReasoningTags } from '../utils/stripReasoning'

export class GroqClient implements ModelProvider {
  private client: Groq
  private defaultModel: string
  private fallbackModel: string

  constructor(apiKey: string, defaultModel: string, fallbackModel: string = 'llama-3.1-8b-instant') {
    this.client = new Groq({ apiKey })
    this.defaultModel = defaultModel
    this.fallbackModel = fallbackModel
  }

  async complete(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
    const model = options.model ?? this.defaultModel
    const temperature = options.temperature ?? 0.3  // Low temp = consistent, predictable responses
    const requestedMaxTokens = options.maxTokens ?? 150
    const maxTokens = Math.max(requestedMaxTokens, 600)

    const startTime = Date.now()

    try {
      log('info', 'Calling Groq API', { model, messageCount: messages.length })

      const completion = await this.client.chat.completions.create({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature,
        max_tokens: maxTokens,
      })

      const latencyMs = Date.now() - startTime
      const rawContent = completion.choices[0]?.message?.content ?? ''
      const content = stripReasoningTags(rawContent)
      const tokensUsed = completion.usage?.total_tokens ?? 0

      log('info', 'Groq API response received', { latencyMs, tokensUsed, model })

      return { content, model, tokensUsed, latencyMs }

    } catch (error: unknown) {
      const latencyMs = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      log('error', 'Groq API call failed, attempting fallback', { error: errorMessage, model })

      if (model !== this.fallbackModel) {
        try {
          const fallbackCompletion = await this.client.chat.completions.create({
            model: this.fallbackModel,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            temperature,
            max_tokens: maxTokens,
          })

          const fallbackLatency = Date.now() - startTime
          const rawContent = fallbackCompletion.choices[0]?.message?.content ?? ''
          const content = stripReasoningTags(rawContent)
          const tokensUsed = fallbackCompletion.usage?.total_tokens ?? 0

          log('warn', 'Used fallback model', { fallbackModel: this.fallbackModel, fallbackLatency })
          return { content, model: this.fallbackModel, tokensUsed, latencyMs: fallbackLatency }

        } catch (fallbackError: unknown) {
          const fbMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          log('error', 'Fallback model also failed', { error: fbMsg })
        }
      }

      return {
        content: "I'm sorry, I'm having trouble processing your request right now. Please try again.",
        model,
        tokensUsed: 0,
        latencyMs,
      }
    }
  }
}
