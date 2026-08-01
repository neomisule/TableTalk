import type { STTResult, TTSResult } from '../types/index'

export interface STTClient {
  /**
   * Transcribe audio to text.
   * @param audioBase64 - Base64-encoded audio (WAV, MP3, or OGG)
   * @param language    - Optional language hint (ISO 639-1 code)
   */
  transcribe(audioBase64: string, language?: string): Promise<STTResult>
}

export interface TTSClient {
  /**
   * Synthesize text to speech audio.
   * @param text - The text to speak aloud
   */
  synthesize(text: string): Promise<TTSResult>
}

export type { STTResult, TTSResult }
