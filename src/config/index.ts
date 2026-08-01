import type { SupportedLanguage } from '../types/index'

export interface Env {
  GROQ_API_KEY: string
  GROQ_MODEL: string
  GROQ_FALLBACK_MODEL: string
  ELEVENLABS_API_KEY: string
  ELEVENLABS_VOICE_ID: string
  DEFAULT_LANGUAGE: string
  SUPPORTED_LANGUAGES: string
  LATENCY_TARGET_MS: string        // Stored as string in toml, parsed to number
  LOW_CONFIDENCE_THRESHOLD: string // Stored as string in toml, parsed to number
  ENABLE_GLM_EVALUATION: string    // "true" or "false"
}

export interface AppConfig {
  groqApiKey: string
  groqModel: string
  groqFallbackModel: string
  enableGlmEvaluation: boolean
  elevenLabsApiKey: string
  elevenLabsVoiceId: string
  defaultLanguage: SupportedLanguage
  supportedLanguages: SupportedLanguage[]
  latencyTargetMs: number
  lowConfidenceThreshold: number
}

function resolveModelAlias(alias: string): string {
  const aliases: Record<string, string> = {
    qwen: 'qwen/qwen3-32b',
    llama: 'llama-3.1-8b-instant',
    'llama-large': 'llama-3.3-70b-versatile',
    glm: 'glm-4-9b-chat', // NOT REAL on Groq today — placeholder only, will 404
    // Allow raw model IDs to pass through unchanged
  }
  return aliases[alias] ?? alias
}

export { resolveModelAlias }

export function getConfig(env: Env): AppConfig {
  // Validate required keys — fail loudly so misconfiguration is obvious immediately
  if (!env.GROQ_API_KEY || env.GROQ_API_KEY.trim() === '') {
    throw new Error('Missing GROQ_API_KEY. Add it to wrangler.toml [vars] (or .env for local scripts).')
  }

  // Parse supported languages from comma-separated string
  const rawLangs = env.SUPPORTED_LANGUAGES || 'en'
  const supportedLanguages = rawLangs
    .split(',')
    .map(l => l.trim())
    .filter(l => ['en', 'es', 'ta', 'te', 'hi'].includes(l)) as SupportedLanguage[]

  const defaultLanguage = (env.DEFAULT_LANGUAGE || 'en') as SupportedLanguage

  return {
    groqApiKey: env.GROQ_API_KEY,
    groqModel: resolveModelAlias(env.GROQ_MODEL || 'qwen'),
    groqFallbackModel: resolveModelAlias(env.GROQ_FALLBACK_MODEL || 'llama'),
    enableGlmEvaluation: env.ENABLE_GLM_EVALUATION === 'true',
    elevenLabsApiKey: env.ELEVENLABS_API_KEY || '',
    elevenLabsVoiceId: env.ELEVENLABS_VOICE_ID || 'Rachel',
    defaultLanguage,
    supportedLanguages: supportedLanguages.length > 0 ? supportedLanguages : ['en'],
    latencyTargetMs: parseInt(env.LATENCY_TARGET_MS || '2000', 10),
    lowConfidenceThreshold: parseFloat(env.LOW_CONFIDENCE_THRESHOLD || '0.75'),
  }
}
