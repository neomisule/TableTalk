import type { Intent, LLMMessage } from '../types/index'
import type { ModelProvider } from '../llm/types'
import type { AppConfig } from '../config/index'
import { log } from '../utils/logger'

// Keywords that strongly signal each intent
const INTENT_KEYWORDS: Record<Exclude<Intent, 'unclear'>, string[]> = {
  reservation: [
    'book', 'reserve', 'table', 'reservation', 'seat', 'dining', 'dine',
    'party of', 'people', 'guests', 'make a booking',
  ],
  menu: [
    'menu', 'food', 'dish', 'dishes', 'eat', 'order', 'vegetarian', 'vegan',
    'gluten', 'allergen', 'allergy', 'price', 'cost', 'how much', 'what do you serve',
    'cuisine', 'specials', 'pasta', 'pizza', 'seafood', 'dessert',
  ],
  hours_location: [
    'open', 'close', 'hours', 'when do you', 'what time', 'where', 'location',
    'address', 'directions', 'parking', 'how do i get', 'find you',
  ],
  human_handoff: [
    'human', 'person', 'manager', 'speak to someone', 'representative', 'agent',
    'real person', 'staff', 'talk to someone', 'transfer me', 'operator',
  ],
  general: [], 
}

export interface RouterResult {
  intent: Intent
  confidence: number
  method: 'keyword' | 'llm'
}

export class RouterAgent {
  private llm: ModelProvider
  private config: AppConfig

  constructor(llm: ModelProvider, config: AppConfig) {
    this.llm = llm
    this.config = config
  }

  async classify(message: string): Promise<RouterResult> {
    const lowerMsg = message.toLowerCase()

    //Try keyword matching (fast path)
    const keywordResult = this.classifyWithKeywords(lowerMsg)
    if (keywordResult.confidence >= this.config.lowConfidenceThreshold) {
      log('debug', 'RouterAgent: intent via keyword', keywordResult)
      return { ...keywordResult, method: 'keyword' }
    }

    //LLM classification
    log('debug', 'RouterAgent: keyword confidence low, falling back to LLM', { confidence: keywordResult.confidence })
    const llmResult = await this.classifyWithLLM(message)
    log('debug', 'RouterAgent: intent via LLM', llmResult)
    return { ...llmResult, method: 'llm' }
  }

  private classifyWithKeywords(lowerMsg: string): Omit<RouterResult, 'method'> {
    const scores: Partial<Record<Intent, number>> = {}
    let maxScore = 0
    let bestIntent: Intent = 'unclear'

    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS) as [Intent, string[]][]) {
      if (keywords.length === 0) continue

      const matchCount = keywords.filter(kw => lowerMsg.includes(kw)).length
      if (matchCount > 0) {
        // Score = (matched keywords / total keywords for this intent), capped at 1.0
        const score = Math.min(matchCount / Math.min(keywords.length, 3), 1.0)
        scores[intent] = score

        if (score > maxScore) {
          maxScore = score
          bestIntent = intent
        }
      }
    }

    if (maxScore === 0) {
      return { intent: 'unclear', confidence: 0.0 }
    }

    return { intent: bestIntent, confidence: maxScore }
  }

  //ask the LLM to classify ambiguous messages
  private async classifyWithLLM(message: string): Promise<Omit<RouterResult, 'method'>> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a restaurant call center classifier. Given a caller's message, classify their intent.
Reply with ONLY one of these words (nothing else):
- reservation (wants to book a table)
- menu (asking about food, prices, or dietary options)
- hours_location (asking about hours or location)
- human_handoff (wants to speak to a real person)
- general (general question)
- unclear (cannot determine intent)`,
      },
      {
        role: 'user',
        content: message,
      },
    ]

    try {
      const response = await this.llm.complete(messages, { temperature: 0.1, maxTokens: 10 })
      const cleaned = response.content.trim().toLowerCase()
      const validIntents: Intent[] = ['reservation', 'menu', 'hours_location', 'human_handoff', 'general', 'unclear']
      const intent = validIntents.find(i => cleaned.includes(i)) ?? 'unclear'

      return {
        intent,
        confidence: intent === 'unclear' ? 0.3 : 0.85,
      }
    } catch (error) {
      log('error', 'RouterAgent: LLM classification failed', { error: String(error) })
      return { intent: 'unclear', confidence: 0.0 }
    }
  }
}
