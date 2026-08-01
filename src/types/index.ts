export type Intent =
  | 'reservation'      // Book a table
  | 'menu'             // Ask about food/drinks
  | 'hours_location'   // Ask about hours or where the restaurant is
  | 'human_handoff'    // Wants to talk to a real person
  | 'general'          // General question not fitting above
  | 'unclear'          // Could not determine intent

export type WorkflowStep =
  | 'ask_party_size'    // How many people?
  | 'ask_date'          // What date?
  | 'ask_time'          // What time?
  | 'ask_name'          // Name for the reservation?
  | 'ask_phone'         // Callback phone number?
  | 'confirm_details'   // Read back all details for confirmation
  | 'completed'         // Reservation fully collected and confirmed
  | 'idle'              // No active workflow

export type SupportedLanguage = 'en' | 'es' | 'ta' | 'te' | 'hi'

export interface ReservationDetails {
  partySize?: number   // Number of guests
  date?: string        // ISO date string (YYYY-MM-DD) or friendly string like "tomorrow"
  time?: string        // Time string like "7:00 PM"
  name?: string        // Name for the reservation
  phone?: string       // Contact phone number
  confirmed?: boolean  // Has the caller confirmed all details?
}

export interface SessionState {
  sessionId: string
  language: SupportedLanguage
  currentIntent: Intent | null
  workflowStep: WorkflowStep
  reservation: ReservationDetails
  // Full transcript history for debugging and context injection
  transcriptHistory: Array<{ role: 'user' | 'agent'; message: string; timestamp: number }>
  lastUserMessage: string
  lastAgentMessage: string
  createdAt: number
  updatedAt: number
  // Audio quality signals — used by TurnManagerAgent
  transcriptionConfidence: number  // 0.0–1.0 from STT engine
  intentConfidence: number         // 0.0–1.0 from RouterAgent
  isUnclear: boolean               // True if agent couldn't parse the message
  wasInterrupted: boolean          // True if caller interrupted the agent mid-speech
  noisyInput: boolean              // True if STT flagged background noise
  multipleSpeakers: boolean        // True if multiple voices detected
}

export interface VoiceEvent {
  sessionId: string
  transcript: string         // Already-transcribed text from STT
  confidence: number         // STT confidence 0.0–1.0
  language?: string          // Language hint from STT or phone provider
  noisyAudio?: boolean       // Phone provider signaled background noise
  multipleSpeakers?: boolean // Phone provider detected multiple speakers
  isInterruption?: boolean   // Caller started speaking before agent finished
  timestamp: number          // Unix ms when the audio was captured
}

export interface AgentResponse {
  message: string                   // Text to be spoken to caller (via TTS)
  intent: Intent                    // Classified intent for this turn
  workflowStep: WorkflowStep        // Current workflow step after processing
  shouldEndCall: boolean            // True if agent wants to hang up
  requiresHumanHandoff: boolean     // True if caller should be transferred
  latency: LatencyMetrics           // Full breakdown of where time was spent
}

export interface LatencyMetrics {
  requestStartTime: number   // Unix ms when the request arrived
  transcriptionMs: number    // Time spent in STT (or 0 if transcript already provided)
  routingMs: number          // Time RouterAgent took to classify intent
  llmMs: number              // Time spent waiting for LLM response
  validationMs: number       // Time ValidationAgent took to check the response
  ttsMs: number              // Time spent in TTS synthesis
  totalResponseMs: number    // Wall-clock time from request receipt to response ready
  ttftMs: number | null      // Time to First Token — null until streaming is implemented
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMResponse {
  content: string      // The generated text
  model: string        // Which model produced this (for logging/debugging)
  tokensUsed: number   // Total tokens for cost tracking
  latencyMs: number    // How long the LLM call took
}

export interface LLMOptions {
  temperature?: number    // 0.0 = deterministic, 1.0 = creative. Default: 0.3 for agents
  maxTokens?: number      // Cap on response length. Default: 150 (short for voice)
  model?: string          // Override the default model for this call
}

export interface STTResult {
  transcript: string    // The transcribed text
  confidence: number    // How confident the STT engine is (0.0–1.0)
  language: string      // Detected or confirmed language code
  durationMs: number    // How long the STT call took
}

export interface TTSResult {
  audioBase64?: string   // Base64-encoded audio data (if returned inline)
  audioUrl?: string      // URL to audio file (if returned as a link)
  durationMs: number     // How long the TTS call took
  characterCount: number // Number of characters synthesized (for cost tracking)
}

export interface EvalTestCase {
  id: string
  description: string
  input: VoiceEvent
  expectedIntent: Intent
  expectedWorkflowStep?: WorkflowStep
  expectedReservationFields?: Partial<ReservationDetails>
  expectsClarification?: boolean   // Should agent ask for clarification?
  expectsHandoff?: boolean         // Should agent offer human handoff?
}

export interface EvalResult {
  testCaseId: string
  description: string
  passed: boolean
  scores: {
    intentAccuracy: number           // 1.0 if intent matched, 0.0 if not
    workflowAccuracy: number         // 1.0 if workflow step matched
    reservationFieldAccuracy: number // Partial credit per collected field
    latencyScore: number             // 1.0 if under target, degrades linearly
    clarificationCorrect: boolean    // Did agent ask for clarification when expected?
    handoffCorrect: boolean          // Did agent offer handoff when expected?
  }
  latency: LatencyMetrics
  agentResponse: AgentResponse
  notes: string[]                    // Human-readable notes about pass/fail reasons
}

export interface EvalSummary {
  totalTests: number
  passed: number
  failed: number
  passRate: number                   // 0.0–1.0
  avgLatencyMs: number
  avgIntentAccuracy: number
  avgWorkflowAccuracy: number
  avgReservationFieldAccuracy: number
  avgLatencyScore: number
  overallScore: number               // Weighted average of all metrics
  results: EvalResult[]
}
