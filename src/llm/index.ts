import { GroqClient } from './GroqClient'
import type { ModelProvider } from './types'
import type { AppConfig } from '../config/index'

export function createLLMClient(config: AppConfig): ModelProvider {
  return new GroqClient(config.groqApiKey, config.groqModel, config.groqFallbackModel)
}

export type { ModelProvider }
export { GroqClient } from './GroqClient'
