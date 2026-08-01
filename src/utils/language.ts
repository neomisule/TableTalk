import type { SupportedLanguage } from '../types/index'

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['en', 'es', 'ta', 'te', 'hi']

// Language display names (for logging and debugging)
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  es: 'Spanish',
  ta: 'Tamil',
  te: 'Telugu',
  hi: 'Hindi',
}
export function detectLanguage(text: string): SupportedLanguage {
  // Check for Devanagari script (Hindi)
  if (/[ऀ-ॿ]/.test(text)) return 'hi'

  // Check for Tamil script
  if (/[஀-௿]/.test(text)) return 'ta'

  // Check for Telugu script
  if (/[ఀ-౿]/.test(text)) return 'te'

  // Check for common Spanish words (very rough heuristic)
  const spanishIndicators = ['hola', 'gracias', 'por favor', 'sí', 'mesa', 'reserva', 'quiero']
  const lowerText = text.toLowerCase()
  if (spanishIndicators.some(word => lowerText.includes(word))) return 'es'

  // Default to English
  return 'en'
}

export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)
}

export function resolveLanguage(langCode: string | undefined): SupportedLanguage {
  if (!langCode) return 'en'
  // Handle codes like "en-US" → "en"
  const base = langCode.split('-')[0].toLowerCase()
  return isSupportedLanguage(base) ? base : 'en'
}
