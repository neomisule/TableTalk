import type { TTSClient, TTSResult } from './types'
import { log } from '../utils/logger'
import { stripReasoningTags } from '../utils/stripReasoning'

export class ElevenLabsTTSClient implements TTSClient {
  private apiKey: string
  private voiceId: string
  private baseUrl = 'https://api.elevenlabs.io/v1'

  constructor(apiKey: string, voiceId: string = 'Rachel') {
    if (!apiKey) {
      throw new Error('ElevenLabsTTSClient requires an API key. Set ELEVENLABS_API_KEY in your environment.')
    }
    this.apiKey = apiKey
    this.voiceId = voiceId
  }

  async synthesize(rawText: string): Promise<TTSResult> {
    const startTime = Date.now()
    const text = stripReasoningTags(rawText)

    try {
      log('info', 'ElevenLabs TTS: synthesizing', { charCount: text.length, voiceId: this.voiceId })

      const response = await fetch(`${this.baseUrl}/text-to-speech/${this.voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2',  // Turbo model has lower latency, important for voice agents
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`ElevenLabs TTS API error ${response.status}: ${errorText}`)
      }

      // Get the audio as array buffer and convert to base64
      const audioBuffer = await response.arrayBuffer()
      const audioBytes = new Uint8Array(audioBuffer)
      let binary = ''
      for (let i = 0; i < audioBytes.length; i++) {
        binary += String.fromCharCode(audioBytes[i])
      }
      const audioBase64 = btoa(binary)

      const durationMs = Date.now() - startTime
      log('info', 'ElevenLabs TTS: synthesis complete', { durationMs, charCount: text.length })

      return {
        audioBase64,
        durationMs,
        characterCount: text.length,
      }

    } catch (error: unknown) {
      const durationMs = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)
      log('error', 'ElevenLabs TTS: synthesis failed', { error: errorMessage, durationMs })

      // Return empty audio rather than crashing the call
      return {
        audioBase64: '',
        durationMs,
        characterCount: text.length,
      }
    }
  }
}
