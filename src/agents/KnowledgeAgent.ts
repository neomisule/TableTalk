// Answers menu, hours, location, policies.
// In production, we replace the hardcoded knowledge constant with:
// - A Cloudflare KV lookup (for frequently-updated menus)
// - A vector search (for large menu databases with semantic search)
// - A CMS API call (if the restaurant uses Toast, Square, etc.)

import type { SessionState, LLMMessage, LatencyMetrics } from '../types/index'
import type { ModelProvider } from '../llm/types'
import type { AppConfig } from '../config/index'
import { log } from '../utils/logger'

const KNOWLEDGE_BASE = {
  name: 'Bella Vista',
  cuisine: 'Italian-American',
  hours: {
    'Monday–Thursday': '11:00 AM – 9:00 PM',
    'Friday–Saturday': '11:00 AM – 10:00 PM',
    'Sunday': '12:00 PM – 8:00 PM',
  },
  location: '123 Main Street, Downtown',
  phone: '(555) 123-4567',
  popularDishes: ['Margherita Pizza', 'Pasta Carbonara', 'Grilled Salmon', 'Tiramisu'],
  vegetarianOptions: true,
  veganOptions: 'limited',
  allergenPolicy: 'Please inform your server of any allergies before ordering.',
  parking: 'Street parking available. Nearby parking garage on Oak Street.',
  reservationRequired: 'Recommended for parties of 6 or more.',
  dressCode: 'Casual dining.',
  privateEvents: 'We accommodate private events. Call us for details.',
}

//find relevant knowledge for the query

function getRelevantContext(userMessage: string): string {
  const msg = userMessage.toLowerCase()
  const sections: string[] = []

  if (/hours|open|close|when/.test(msg)) {
    sections.push(
      `Hours: Mon-Thu ${KNOWLEDGE_BASE.hours['Monday–Thursday']}, ` +
      `Fri-Sat ${KNOWLEDGE_BASE.hours['Friday–Saturday']}, ` +
      `Sun ${KNOWLEDGE_BASE.hours['Sunday']}`
    )
  }

  if (/where|location|address|direction|park/.test(msg)) {
    sections.push(`Location: ${KNOWLEDGE_BASE.location}`)
    sections.push(`Parking: ${KNOWLEDGE_BASE.parking}`)
  }

  if (/menu|food|dish|eat|cuisine/.test(msg)) {
    sections.push(`Cuisine: ${KNOWLEDGE_BASE.cuisine}`)
    sections.push(`Popular dishes: ${KNOWLEDGE_BASE.popularDishes.join(', ')}`)
  }

  if (/vegetarian|vegan/.test(msg)) {
    sections.push(`Vegetarian: ${KNOWLEDGE_BASE.vegetarianOptions ? 'Yes, we have vegetarian options' : 'Limited options'}`)
    sections.push(`Vegan: ${KNOWLEDGE_BASE.veganOptions}`)
  }

  if (/allerg|gluten|dairy|nut/.test(msg)) {
    sections.push(`Allergen policy: ${KNOWLEDGE_BASE.allergenPolicy}`)
  }

  if (/price|cost|how much|expensive/.test(msg)) {
    sections.push(`We are a casual Italian-American restaurant. Entrees typically range from $15-$30.`)
  }

  if (/phone|call|contact|number/.test(msg)) {
    sections.push(`Phone: ${KNOWLEDGE_BASE.phone}`)
  }

  // If nothing specific matched, include general info
  if (sections.length === 0) {
    sections.push(
      `${KNOWLEDGE_BASE.name} serves ${KNOWLEDGE_BASE.cuisine} cuisine.`,
      `Location: ${KNOWLEDGE_BASE.location}`,
      `Phone: ${KNOWLEDGE_BASE.phone}`,
    )
  }

  return sections.join('\n')
}

export class KnowledgeAgent {
  private llm: ModelProvider
  private config: AppConfig

  constructor(llm: ModelProvider, config: AppConfig) {
    this.llm = llm
    this.config = config
  }

  async process(
    session: SessionState,
    userMessage: string,
    latencyTracker: { start: (l: string) => void; end: (l: string) => void; getSummary: () => LatencyMetrics }
  ): Promise<{ message: string }> {

    const relevantContext = getRelevantContext(userMessage)

    log('info', 'KnowledgeAgent: processing query', { userMessage, contextLength: relevantContext.length })

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a friendly phone agent for ${KNOWLEDGE_BASE.name}, an Italian-American restaurant.
Answer the caller's question using ONLY the information below. Be SHORT — 1-2 sentences maximum.
This is a phone call. Callers lose track of long answers.

Restaurant information:
${relevantContext}

After answering, briefly ask if there's anything else you can help with.`,
      },
      {
        role: 'user',
        content: userMessage,
      },
    ]

    latencyTracker.start('llm')
    const response = await this.llm.complete(messages, { temperature: 0.3, maxTokens: 100 })
    latencyTracker.end('llm')

    log('info', 'KnowledgeAgent: response generated', { latencyMs: response.latencyMs })

    return { message: response.content }
  }
}
