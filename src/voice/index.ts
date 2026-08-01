import { ElevenLabsSTTClient } from './ElevenLabsSTT'
import { ElevenLabsTTSClient } from './ElevenLabsTTS'
import type { STTClient, TTSClient } from './types'
import type { AppConfig } from '../config/index'

function requireElevenLabsKey(config: AppConfig): string {
  if (!config.elevenLabsApiKey || config.elevenLabsApiKey.trim() === '') {
    throw new Error(
      'Missing ELEVENLABS_API_KEY. Add it to wrangler.toml [vars] (or .env for local scripts) ' +
      'before calling createSTTClient/createTTSClient.'
    )
  }
  return config.elevenLabsApiKey
}

export function createSTTClient(config: AppConfig): STTClient {
  return new ElevenLabsSTTClient(requireElevenLabsKey(config))
}

export function createTTSClient(config: AppConfig): TTSClient {
  return new ElevenLabsTTSClient(requireElevenLabsKey(config), config.elevenLabsVoiceId)
}

export type { STTClient, TTSClient }
