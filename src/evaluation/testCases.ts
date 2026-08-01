import type { EvalTestCase } from '../types/index'

const BASE_TIMESTAMP = Date.now()

export const TEST_CASES: EvalTestCase[] = [
  //Standard reservation request 
  {
    id: 'TC-001',
    description: 'Simple reservation — table for 2, tomorrow at 7pm',
    input: {
      sessionId: 'eval-tc-001',
      transcript: "Hi, I'd like to book a table for 2 people tomorrow at 7pm",
      confidence: 0.97,
      language: 'en',
      noisyAudio: false,
      multipleSpeakers: false,
      isInterruption: false,
      timestamp: BASE_TIMESTAMP,
    },
    expectedIntent: 'reservation',
    expectedWorkflowStep: 'ask_name',  // Party size, date, time provided — name is next
    expectedReservationFields: {
      partySize: 2,
      date: 'tomorrow',
      time: '7:00 PM',
    },
  },
  //Changing size mid-conversation
  {
    id: 'TC-002',
    description: 'Changing party size after already providing one',
    input: {
      sessionId: 'eval-tc-002',
      transcript: "Actually, make it 6 people instead",
      confidence: 0.94,
      language: 'en',
      timestamp: BASE_TIMESTAMP,
    },
    expectedIntent: 'reservation',
    expectedReservationFields: {
      partySize: 6,
    },
  },

  //Menu question vegetarian options
  {
    id: 'TC-003',
    description: 'Caller asks about vegetarian options',
    input: {
      sessionId: 'eval-tc-003',
      transcript: "Do you have vegetarian options on your menu?",
      confidence: 0.98,
      language: 'en',
      timestamp: BASE_TIMESTAMP,
    },
    expectedIntent: 'menu',
  },

  //Hours and location question
  {
    id: 'TC-004',
    description: 'Caller asks what time the restaurant closes on Friday',
    input: {
      sessionId: 'eval-tc-004',
      transcript: "What time do you close on Fridays?",
      confidence: 0.99,
      language: 'en',
      timestamp: BASE_TIMESTAMP,
    },
    expectedIntent: 'hours_location',
  },

  //Low confidence — should trigger clarification
  {
    id: 'TC-005',
    description: 'Low confidence transcription (0.4) — agent should ask to repeat',
    input: {
      sessionId: 'eval-tc-005',
      transcript: "I wanna um book the um yeah table",
      confidence: 0.4,
      language: 'en',
      timestamp: BASE_TIMESTAMP,
    },
    expectedIntent: 'unclear',
    expectsClarification: true,
  },

  //Noisy audio environment
  {
    id: 'TC-006',
    description: 'Noisy audio flag — agent should handle gracefully',
    input: {
      sessionId: 'eval-tc-006',
      transcript: "reservation for tonight please",
      confidence: 0.65,  // Borderline confidence + noisy flag
      language: 'en',
      noisyAudio: true,
      timestamp: BASE_TIMESTAMP,
    },
    expectedIntent: 'unclear',
    expectsClarification: true,
  },

  //Human handoff request
  {
    id: 'TC-007',
    description: 'Caller explicitly requests to speak to a human',
    input: {
      sessionId: 'eval-tc-007',
      transcript: "Can I speak to a manager please?",
      confidence: 0.99,
      language: 'en',
      timestamp: BASE_TIMESTAMP,
    },
    expectedIntent: 'human_handoff',
    expectsHandoff: true,
  },

  //Multiple speakers detected
  {
    id: 'TC-008',
    description: 'Multiple speakers detected — agent should process but flag it',
    input: {
      sessionId: 'eval-tc-008',
      transcript: "we want to make a reservation for Saturday",
      confidence: 0.82,
      language: 'en',
      multipleSpeakers: true,
      timestamp: BASE_TIMESTAMP,
    },
    expectedIntent: 'reservation',
  },

  //Different language input
  {
    id: 'TC-009',
    description: 'Spanish language — caller asks for a reservation in Spanish',
    input: {
      sessionId: 'eval-tc-009',
      transcript: "Hola, quiero hacer una reserva para dos personas por favor",
      confidence: 0.91,
      language: 'es',
      timestamp: BASE_TIMESTAMP,
    },
    expectedIntent: 'reservation',
  },

  //Caller interrupts mid response
  {
    id: 'TC-010',
    description: 'Caller interruption — agent should acknowledge and yield',
    input: {
      sessionId: 'eval-tc-010',
      transcript: "wait wait, I need to change something",
      confidence: 0.88,
      language: 'en',
      isInterruption: true,
      timestamp: BASE_TIMESTAMP,
    },
    expectedIntent: 'general',  // Interruption acknowledgment — intent doesn't matter much
  },
]
