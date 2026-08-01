import type { SessionState, SupportedLanguage } from '../types/index'
import { log } from '../utils/logger'

export class SessionStore {
  // In-memory store: sessionId → SessionState
  private sessions: Map<string, SessionState> = new Map()

  create(sessionId: string): SessionState {
    const now = Date.now()
    const state: SessionState = {
      sessionId,
      language: 'en',
      currentIntent: null,
      workflowStep: 'idle',
      reservation: {},
      transcriptHistory: [],
      lastUserMessage: '',
      lastAgentMessage: '',
      createdAt: now,
      updatedAt: now,
      transcriptionConfidence: 1.0,
      intentConfidence: 1.0,
      isUnclear: false,
      wasInterrupted: false,
      noisyInput: false,
      multipleSpeakers: false,
    }

    this.sessions.set(sessionId, state)
    log('info', 'SessionStore: created new session', { sessionId })
    return state
  }

  get(sessionId: string): SessionState | null {
    return this.sessions.get(sessionId) ?? null
  }

  update(sessionId: string, partial: Partial<SessionState>): SessionState {
    const existing = this.sessions.get(sessionId)
    if (!existing) {
      log('warn', 'SessionStore: update called for unknown session, creating new', { sessionId })
      const fresh = this.create(sessionId)
      const updated = { ...fresh, ...partial, sessionId, updatedAt: Date.now() }
      this.sessions.set(sessionId, updated)
      return updated
    }

    const updated: SessionState = {
      ...existing,
      ...partial,
      // Always merge reservation details rather than replacing them entirely
      reservation: {
        ...existing.reservation,
        ...(partial.reservation ?? {}),
      },
      sessionId,
      updatedAt: Date.now(),
    }

    this.sessions.set(sessionId, updated)
    return updated
  }

  getOrCreate(sessionId: string): SessionState {
    return this.get(sessionId) ?? this.create(sessionId)
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId)
    log('info', 'SessionStore: deleted session', { sessionId })
  }

  list(): SessionState[] {
    return Array.from(this.sessions.values())
  }

  setLanguage(sessionId: string, language: SupportedLanguage): SessionState {
    return this.update(sessionId, { language })
  }

  appendTranscript(sessionId: string, role: 'user' | 'agent', message: string): SessionState {
    const session = this.getOrCreate(sessionId)
    const entry = { role, message, timestamp: Date.now() }
    return this.update(sessionId, {
      transcriptHistory: [...session.transcriptHistory, entry],
    })
  }
}
