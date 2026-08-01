import type { VoiceEvent, AgentResponse, Intent, WorkflowStep } from '../types/index'
import type { AppConfig, Env } from '../config/index'
import { RouterAgent } from './RouterAgent'
import { ReservationAgent } from './ReservationAgent'
import { KnowledgeAgent } from './KnowledgeAgent'
import { ValidationAgent } from './ValidationAgent'
import { TurnManagerAgent } from './TurnManagerAgent'
import { createLLMClient } from '../llm/index'
import { sessionStore } from '../state/index'
import { LatencyTracker } from '../utils/latency'
import { resolveLanguage } from '../utils/language'
import { log } from '../utils/logger'

// Re-export all agents for external use
export { RouterAgent } from './RouterAgent'
export { ReservationAgent } from './ReservationAgent'
export { KnowledgeAgent } from './KnowledgeAgent'
export { ValidationAgent } from './ValidationAgent'
export { TurnManagerAgent } from './TurnManagerAgent'

export async function processVoiceEvent(
  event: VoiceEvent,
  config: AppConfig,
  _env: Env
): Promise<AgentResponse> {
  const tracker = new LatencyTracker()

  log('info', 'processVoiceEvent: received event', {
    sessionId: event.sessionId,
    confidence: event.confidence,
    transcriptLength: event.transcript.length,
  })

  // Step 1: Get or create session state
  const session = sessionStore.getOrCreate(event.sessionId)

  // Update audio quality signals from this event
  sessionStore.update(event.sessionId, {
    transcriptionConfidence: event.confidence,
    noisyInput: event.noisyAudio ?? false,
    multipleSpeakers: event.multipleSpeakers ?? false,
    wasInterrupted: event.isInterruption ?? false,
    lastUserMessage: event.transcript,
  })

  // Resolve language from event or detect from transcript
  const language = resolveLanguage(event.language ?? session.language)
  if (language !== session.language) {
    sessionStore.update(event.sessionId, { language })
  }

  // Append user message to transcript history
  sessionStore.appendTranscript(event.sessionId, 'user', event.transcript)

  // Step 2: Initialize agents (all share the same LLM client)
  const llm = createLLMClient(config)
  const turnManager = new TurnManagerAgent(config.lowConfidenceThreshold)
  const router = new RouterAgent(llm, config)
  const reservationAgent = new ReservationAgent(llm, config)
  const knowledgeAgent = new KnowledgeAgent(llm, config)
  const validationAgent = new ValidationAgent()

  // Step 3: TurnManager evaluates audio quality
  const turnDecision = turnManager.evaluateTurn(
    event.confidence,
    event.transcript,
    event.noisyAudio ?? false,
    event.multipleSpeakers ?? false,
    event.isInterruption ?? false,
    session
  )

  // If TurnManager says don't process (low confidence, noisy audio), return clarification
  if (!turnDecision.shouldProcess && turnDecision.clarificationMessage) {
    log('info', 'processVoiceEvent: TurnManager requesting clarification', { reason: turnDecision.reason })

    sessionStore.update(event.sessionId, {
      isUnclear: true,
      lastAgentMessage: turnDecision.clarificationMessage,
    })
    sessionStore.appendTranscript(event.sessionId, 'agent', turnDecision.clarificationMessage)

    const latency = tracker.getSummary()
    return {
      message: turnDecision.clarificationMessage,
      intent: session.currentIntent ?? 'unclear',
      workflowStep: session.workflowStep,
      shouldEndCall: false,
      requiresHumanHandoff: false,
      latency,
    }
  }

  // Handle interruption: acknowledge and wait for caller to speak
  if (event.isInterruption && turnDecision.reason === 'interruption') {
    const interruptionAck = turnManager.handleInterruption(session)
    // Don't classify intent on interruption — just acknowledge and reset
    log('info', 'processVoiceEvent: handling interruption')
    sessionStore.update(event.sessionId, {
      lastAgentMessage: interruptionAck,
      wasInterrupted: true,
    })
    const latency = tracker.getSummary()
    return {
      message: interruptionAck,
      intent: session.currentIntent ?? 'general',
      workflowStep: session.workflowStep,
      shouldEndCall: false,
      requiresHumanHandoff: false,
      latency,
    }
  }

  // Step 4: Classify intent
  tracker.start('routing')
  const routerResult = await router.classify(event.transcript)
  tracker.end('routing')

  log('info', 'processVoiceEvent: intent classified', { ...routerResult })

  // Update session with new intent (but don't override reservation if already in progress)
  const effectiveIntent: Intent = (session.workflowStep !== 'idle' && session.workflowStep !== 'completed')
    ? 'reservation'  // Stay in reservation workflow once started
    : routerResult.intent

  sessionStore.update(event.sessionId, {
    currentIntent: effectiveIntent,
    intentConfidence: routerResult.confidence,
    isUnclear: effectiveIntent === 'unclear',
  })

  // Immediately handle human handoff — no LLM needed
  if (effectiveIntent === 'human_handoff') {
    const handoffMessage = "Of course! I'll transfer you to a team member right now. Please hold."
    sessionStore.update(event.sessionId, { lastAgentMessage: handoffMessage })
    sessionStore.appendTranscript(event.sessionId, 'agent', handoffMessage)
    const latency = tracker.getSummary()
    return {
      message: handoffMessage,
      intent: 'human_handoff',
      workflowStep: session.workflowStep,
      shouldEndCall: false,
      requiresHumanHandoff: true,
      latency,
    }
  }

  // Handle unclear intent — ask for clarification
  if (effectiveIntent === 'unclear' && routerResult.confidence < 0.3) {
    const unclearMessage = "I'm sorry, I didn't understand that. I can help with reservations, menu questions, or our hours and location. Which would you like?"
    sessionStore.update(event.sessionId, { lastAgentMessage: unclearMessage, isUnclear: true })
    sessionStore.appendTranscript(event.sessionId, 'agent', unclearMessage)
    const latency = tracker.getSummary()
    return {
      message: unclearMessage,
      intent: 'unclear',
      workflowStep: session.workflowStep,
      shouldEndCall: false,
      requiresHumanHandoff: false,
      latency,
    }
  }

  // Step 5: Route to appropriate agent
  let agentMessage = ''
  let updatedStep: WorkflowStep = session.workflowStep
  let shouldEndCall = false

  // Get a fresh copy of session after all updates
  const freshSession = sessionStore.getOrCreate(event.sessionId)

  switch (effectiveIntent) {
    case 'reservation': {
      // Set initial workflow step if starting fresh
      if (freshSession.workflowStep === 'idle') {
        sessionStore.update(event.sessionId, { workflowStep: 'ask_party_size' })
      }

      const freshSessionForReservation = sessionStore.getOrCreate(event.sessionId)
      const reservationResult = await reservationAgent.process(
        freshSessionForReservation,
        event.transcript,
        tracker
      )

      agentMessage = reservationResult.message
      updatedStep = reservationResult.updatedStep
      shouldEndCall = reservationResult.shouldEndCall

      // Persist updated reservation fields
      const updatedReservation = reservationAgent.getUpdatedReservation(
        freshSessionForReservation,
        event.transcript
      )
      sessionStore.update(event.sessionId, {
        reservation: updatedReservation,
        workflowStep: updatedStep,
      })
      break
    }

    case 'menu':
    case 'hours_location': {
      const knowledgeResult = await knowledgeAgent.process(freshSession, event.transcript, tracker)
      agentMessage = knowledgeResult.message
      break
    }

    case 'general':
    default: {
      // For general queries, use the knowledge agent as a fallback
      const generalResult = await knowledgeAgent.process(freshSession, event.transcript, tracker)
      agentMessage = generalResult.message
      break
    }
  }

  // Step 6: Validate response
  tracker.start('validation')
  const validationResult = validationAgent.validate(agentMessage, freshSession, updatedStep)
  tracker.end('validation')

  if (!validationResult.valid) {
    log('warn', 'processVoiceEvent: validation issues', { issues: validationResult.issues })
  }

  const finalMessage = validationResult.sanitizedResponse

  // Step 7: Update session and return
  sessionStore.update(event.sessionId, {
    lastAgentMessage: finalMessage,
    workflowStep: updatedStep,
  })
  sessionStore.appendTranscript(event.sessionId, 'agent', finalMessage)

  const latency = tracker.getSummary()

  log('info', 'processVoiceEvent: complete', {
    intent: effectiveIntent,
    step: updatedStep,
    totalMs: latency.totalResponseMs,
  })

  return {
    message: finalMessage,
    intent: effectiveIntent,
    workflowStep: updatedStep,
    shouldEndCall,
    requiresHumanHandoff: false,
    latency,
  }
}
