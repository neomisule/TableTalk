import type { LatencyMetrics } from '../types/index'

export class LatencyTracker {
  private startTimes: Map<string, number> = new Map()
  private endTimes: Map<string, number> = new Map()
  private requestStartTime: number

  constructor() {
    this.requestStartTime = Date.now()
  }

  // Start timing a labeled stage
  start(label: string): void {
    this.startTimes.set(label, Date.now())
  }

  // Stop timing a labeled stage
  end(label: string): void {
    this.endTimes.set(label, Date.now())
  }

  // Get elapsed ms for a labeled stage (returns 0 if not measured)
  getMs(label: string): number {
    const start = this.startTimes.get(label)
    const end = this.endTimes.get(label)
    if (start === undefined || end === undefined) return 0
    return end - start
  }

  // Build a complete LatencyMetrics object from all measured stages
  getSummary(): LatencyMetrics {
    return {
      requestStartTime: this.requestStartTime,
      transcriptionMs: this.getMs('transcription'),
      routingMs: this.getMs('routing'),
      llmMs: this.getMs('llm'),
      validationMs: this.getMs('validation'),
      ttsMs: this.getMs('tts'),
      totalResponseMs: Date.now() - this.requestStartTime,
      ttftMs: null,  // Placeholder — implement when streaming LLM responses are added
    }
  }
}
