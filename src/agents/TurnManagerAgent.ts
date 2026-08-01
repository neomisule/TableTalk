import type { SessionState } from '../types/index'
import { log } from '../utils/logger'

export interface TurnDecision {
  shouldProcess: boolean   // False = don't process through agents, send clarification
  clarificationMessage?: string
  reason?: string
}

export class TurnManagerAgent {
  private lowConfidenceThreshold: number

  constructor(lowConfidenceThreshold: number = 0.75) {
    this.lowConfidenceThreshold = lowConfidenceThreshold
  }

  // Returns decision about whether to proceed or ask for clarification.
  evaluateTurn(
    confidence: number,
    transcript: string,
    noisyAudio: boolean,
    multipleSpeakers: boolean,
    isInterruption: boolean,
    session: SessionState
  ): TurnDecision {

    // Check interruption first — it needs special handling even if confidence is high
    if (isInterruption) {
      log('info', 'TurnManagerAgent: interruption detected')
      return {
        shouldProcess: true,  // Do still process, but flag it
        reason: 'interruption',
      }
    }

    // Low confidence check
    if (this.shouldAskClarification(transcript, confidence)) {
      const message = this.buildClarificationRequest(session.lastAgentMessage, transcript)
      log('info', 'TurnManagerAgent: low confidence, requesting clarification', { confidence })
      return {
        shouldProcess: false,
        clarificationMessage: message,
        reason: `low_confidence:${confidence}`,
      }
    }

    // Multiple speakers — process but add a note
    if (multipleSpeakers) {
      log('info', 'TurnManagerAgent: multiple speakers detected')
      return {
        shouldProcess: true,
        reason: 'multiple_speakers',
      }
    }

    // Noisy audio — if confidence is borderline, ask for clarification
    if (noisyAudio && confidence < this.lowConfidenceThreshold + 0.1) {
      const message = "I'm hearing some background noise. Could you please repeat that?"
      log('info', 'TurnManagerAgent: noisy audio with borderline confidence', { confidence })
      return {
        shouldProcess: false,
        clarificationMessage: message,
        reason: 'noisy_audio',
      }
    }

    // All good — proceed to normal processing
    return { shouldProcess: true }
  }

  //determines if confidence is too low to trust
  shouldAskClarification(transcript: string, confidence: number): boolean {
    // Very short transcripts are often noise or incomplete utterances
    if (transcript.trim().split(/\s+/).length < 2 && confidence < 0.9) {
      return true
    }
    return confidence < this.lowConfidenceThreshold
  }

  // Uses partial transcript if available to help confirm what was heard
  buildClarificationRequest(lastAgentQuestion: string, partialTranscript: string): string {
    // If we heard something (even low confidence), reflect it back for confirmation
    if (partialTranscript && partialTranscript.trim().length > 3) {
      const shortened = partialTranscript.trim().slice(0, 50)  // Don't reflect very long text
      return `I'm sorry, I didn't quite catch that. Did you say "${shortened}"? Could you please repeat?`
    }
    return "I'm sorry, I didn't catch that. Could you please say that again?"
  }

  handleInterruption(_session: SessionState): string {
    return "Sure, go ahead!"
  }

  handleMultipleSpeakers(baseResponse: string): string {
    // The agent proceeds normally but we log this for quality monitoring
    log('info', 'TurnManagerAgent: handling multiple speakers scenario')
    return baseResponse  // No change to response — just proceed
  }
}
