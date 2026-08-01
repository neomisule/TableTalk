// Runs each test case through the REAL agent pipeline and compares results.

import type { EvalTestCase, EvalResult, EvalSummary, AgentResponse } from '../types/index'
import type { AppConfig, Env } from '../config/index'
import { processVoiceEvent } from '../agents/index'
import { sessionStore } from '../state/index'
import { scoreIntent, scoreWorkflow, scoreReservationFields, scoreLatency, aggregateResults } from './metrics'
import { log } from '../utils/logger'

async function runSingleTestCase(
  tc: EvalTestCase,
  config: AppConfig,
  env: Env
): Promise<EvalResult> {
  // Clean up any previous session state for this test case
  sessionStore.delete(tc.input.sessionId)

  log('info', `Eval runner: running test case ${tc.id}`, { description: tc.description })

  let agentResponse: AgentResponse
  const notes: string[] = []

  try {
    agentResponse = await processVoiceEvent(tc.input, config, env)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    log('error', `Eval runner: test case ${tc.id} threw an error`, { error: errorMsg })
    notes.push(`ERROR: ${errorMsg}`)

    // Return a failed result if the pipeline threw
    const failedResult: EvalResult = {
      testCaseId: tc.id,
      description: tc.description,
      passed: false,
      scores: {
        intentAccuracy: 0,
        workflowAccuracy: 0,
        reservationFieldAccuracy: 0,
        latencyScore: 0,
        clarificationCorrect: false,
        handoffCorrect: false,
      },
      latency: {
        requestStartTime: Date.now(),
        transcriptionMs: 0,
        routingMs: 0,
        llmMs: 0,
        validationMs: 0,
        ttsMs: 0,
        totalResponseMs: 9999,
        ttftMs: null,
      },
      agentResponse: {
        message: '',
        intent: 'unclear',
        workflowStep: 'idle',
        shouldEndCall: false,
        requiresHumanHandoff: false,
        latency: {
          requestStartTime: Date.now(),
          transcriptionMs: 0,
          routingMs: 0,
          llmMs: 0,
          validationMs: 0,
          ttsMs: 0,
          totalResponseMs: 9999,
          ttftMs: null,
        },
      },
      notes,
    }
    return failedResult
  }

  const intentScore = scoreIntent(tc.expectedIntent, agentResponse.intent)
  const workflowScore = scoreWorkflow(tc.expectedWorkflowStep, agentResponse.workflowStep)

  // Get the current session state to check reservation fields
  const sessionState = sessionStore.get(tc.input.sessionId)
  const reservationScore = scoreReservationFields(
    tc.expectedReservationFields,
    sessionState?.reservation ?? {}
  )
  const latencyScore = scoreLatency(agentResponse.latency, config.latencyTargetMs)

  // Check clarification behavior
  const clarificationCorrect = tc.expectsClarification !== undefined
    ? tc.expectsClarification === (agentResponse.intent === 'unclear')
    : true

  // Check handoff behavior
  const handoffCorrect = tc.expectsHandoff !== undefined
    ? tc.expectsHandoff === agentResponse.requiresHumanHandoff
    : true

  const passed = intentScore === 1.0 && clarificationCorrect && handoffCorrect

  // Add notes for failures
  if (intentScore < 1.0) {
    notes.push(`Intent mismatch: expected '${tc.expectedIntent}', got '${agentResponse.intent}'`)
  }
  if (workflowScore < 1.0 && tc.expectedWorkflowStep) {
    notes.push(`Workflow step mismatch: expected '${tc.expectedWorkflowStep}', got '${agentResponse.workflowStep}'`)
  }
  if (reservationScore < 1.0 && tc.expectedReservationFields) {
    notes.push(`Reservation field accuracy: ${(reservationScore * 100).toFixed(0)}%`)
  }
  if (latencyScore < 1.0) {
    notes.push(`Latency over target: ${agentResponse.latency.totalResponseMs}ms (target: ${config.latencyTargetMs}ms)`)
  }
  if (!clarificationCorrect) {
    notes.push(`Clarification behavior incorrect: expected ${tc.expectsClarification}, got ${agentResponse.intent === 'unclear'}`)
  }
  if (!handoffCorrect) {
    notes.push(`Handoff behavior incorrect: expected ${tc.expectsHandoff}, got ${agentResponse.requiresHumanHandoff}`)
  }

  log('info', `Eval runner: test case ${tc.id} ${passed ? 'PASSED' : 'FAILED'}`, {
    intentScore,
    workflowScore,
    latencyMs: agentResponse.latency.totalResponseMs,
    notes,
  })

  return {
    testCaseId: tc.id,
    description: tc.description,
    passed,
    scores: {
      intentAccuracy: intentScore,
      workflowAccuracy: workflowScore,
      reservationFieldAccuracy: reservationScore,
      latencyScore,
      clarificationCorrect,
      handoffCorrect,
    },
    latency: agentResponse.latency,
    agentResponse,
    notes,
  }
}

export async function runEvaluation(
  testCases: EvalTestCase[],
  config: AppConfig,
  env: Env
): Promise<EvalSummary> {
  log('info', `Eval runner: starting evaluation of ${testCases.length} test cases`)

  const results: EvalResult[] = []

  // Run sequentially to avoid session state conflicts between test cases
  for (const tc of testCases) {
    const result = await runSingleTestCase(tc, config, env)
    results.push(result)
  }

  const summary = aggregateResults(results, config.latencyTargetMs)

  log('info', 'Eval runner: evaluation complete', {
    totalTests: summary.totalTests,
    passed: summary.passed,
    failed: summary.failed,
    overallScore: summary.overallScore.toFixed(3),
    avgLatencyMs: summary.avgLatencyMs.toFixed(0),
  })

  return summary
}
