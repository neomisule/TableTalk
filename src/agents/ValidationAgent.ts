import type { SessionState, WorkflowStep } from '../types/index'
import { log } from '../utils/logger'

export interface ValidationResult {
  valid: boolean
  issues: string[]
  sanitizedResponse: string
}

// Patterns that indicate an unfilled template placeholder
const PLACEHOLDER_PATTERNS = [
  /\[NAME\]/i,
  /\[DATE\]/i,
  /\[TIME\]/i,
  /\[PHONE\]/i,
  /\[PARTY_SIZE\]/i,
  /\[NUMBER\]/i,
  /undefined/i,
  /null/i,
  /\{\{[^}]+\}\}/,  // Handlebars-style {{VARIABLE}}
]

// Words that indicate a premature confirmation
const CONFIRMATION_PHRASES = [
  'your reservation is confirmed',
  'reservation has been booked',
  "you're all set",
  'successfully booked',
  'reservation is complete',
]

export class ValidationAgent {
  validate(
    response: string,
    session: SessionState,
    step: WorkflowStep
  ): ValidationResult {
    const issues: string[] = []
    let sanitized = response.trim()

    // Check 1: Empty response
    if (!sanitized || sanitized.length === 0) {
      issues.push('Empty response from LLM')
      sanitized = "I'm sorry, could you please repeat that? I want to make sure I have your details correct."
      return { valid: false, issues, sanitizedResponse: sanitized }
    }

    // Check 2: Unfilled template placeholders
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(sanitized)) {
        issues.push(`Response contains unfilled placeholder: ${pattern.toString()}`)
        // Remove the placeholder and patch the sentence
        sanitized = sanitized.replace(pattern, 'your information')
      }
    }

    // Check 3: Premature confirmation
    if (step !== 'completed' && step !== 'confirm_details') {
      const lowerSanitized = sanitized.toLowerCase()
      for (const phrase of CONFIRMATION_PHRASES) {
        if (lowerSanitized.includes(phrase)) {
          issues.push(`Premature confirmation phrase detected at step '${step}': "${phrase}"`)
          // Replace the confirmation with a redirect to the current step
          sanitized = "Let me make sure I have all your details. " + sanitized.replace(new RegExp(phrase, 'i'), '')
        }
      }
    }

    // Check 4: Response length warning (voice comfort threshold)
    const VOICE_CHAR_LIMIT = 250
    if (sanitized.length > VOICE_CHAR_LIMIT) {
      issues.push(`Response too long for voice (${sanitized.length} chars > ${VOICE_CHAR_LIMIT}). Consider shortening.`)
      log('warn', 'ValidationAgent: long response detected', { length: sanitized.length, step })
    }

    // Check 5: References missing reservation fields
    if (session.reservation) {
      const r = session.reservation
      if (!r.partySize && /\d+ (people|guests|person)/i.test(sanitized)) {
        issues.push('Response references party size that was not collected')
      }
      if (!r.name && /for (mr|mrs|ms|dr)?\.?\s+[A-Z][a-z]+/i.test(sanitized)) {
        issues.push('Response references caller name that was not collected')
      }
    }

    const valid = issues.length === 0
    if (!valid) {
      log('warn', 'ValidationAgent: issues found', { issues, step })
    }

    return { valid, issues, sanitizedResponse: sanitized }
  }
}
