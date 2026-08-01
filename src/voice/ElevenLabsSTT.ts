import type { STTClient, STTResult } from './types'
import { log } from '../utils/logger'

export class ElevenLabsSTTClient implements STTClient {
  private apiKey: string
  private baseUrl = 'https://api.elevenlabs.io/v1'

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('ElevenLabsSTTClient requires an API key. Set ELEVENLABS_API_KEY in your environment.')
    }
    this.apiKey = apiKey
  }

  async transcribe(audioBase64: string, language: string = 'en'): Promise<STTResult> {
    const startTime = Date.now()

    try {
      log('info', 'ElevenLabs STT: transcribing audio', { language, audioLength: audioBase64.length })

      // Convert base64 to binary for the multipart form upload
      const audioBytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))
      const audioBlob = new Blob([audioBytes], { type: 'audio/wav' })
      const formData = new FormData()
      formData.append('file', audioBlob, 'audio.wav')
      formData.append('model_id', 'scribe_v1')
      formData.append('language_code', language)

      const response = await fetch(`${this.baseUrl}/speech-to-text`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
        },
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`ElevenLabs STT API error ${response.status}: ${errorText}`)
      }

      const data = await response.json() as {
        text?: string
        language_code?: string
        confidence?: number
      }

      const durationMs = Date.now() - startTime

      log('info', 'ElevenLabs STT: transcription complete', { durationMs })

      return {
        transcript: data.text ?? '',
        confidence: data.confidence ?? 0.9,  // ElevenLabs may not always return confidence
        language: data.language_code ?? language,
        durationMs,
      }

    } catch (error: unknown) {
      const durationMs = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)
      log('error', 'ElevenLabs STT: transcription failed', { error: errorMessage, durationMs })

      // Return empty transcript rather than crashing the call
      return {
        transcript: '',
        confidence: 0,
        language,
        durationMs,
      }
    }
  }
}
