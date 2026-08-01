// Simulates a complete restaurant reservation conversation end-to-end
//npm run dev
//npm run eval
// This script walks through a complete reservation:
//   Turn 1: Initial greeting / reservation request
//   Turn 2: Provide party size
//   Turn 3: Provide date
//   Turn 4: Provide time
//   Turn 5: Provide name
//   Turn 6: Provide phone number
//   Turn 7: Confirm details
//   Turn 8: Final evaluation report

const WORKER_URL = 'http://localhost:8787'
const SESSION_ID = `sample-call-${Date.now()}`

interface VoiceEventPayload {
  sessionId: string
  transcript: string
  confidence: number
  language?: string
  noisyAudio?: boolean
  multipleSpeakers?: boolean
  isInterruption?: boolean
  timestamp: number
}

interface AgentResponsePayload {
  message: string
  intent: string
  workflowStep: string
  shouldEndCall: boolean
  requiresHumanHandoff: boolean
  latency: {
    totalResponseMs: number
    llmMs: number
    routingMs: number
    ttsMs: number
    validationMs: number
  }
}

async function sendEvent(
  transcript: string,
  options: Partial<VoiceEventPayload> = {}
): Promise<AgentResponsePayload> {
  const payload: VoiceEventPayload = {
    sessionId: SESSION_ID,
    transcript,
    confidence: options.confidence ?? 0.95,
    language: options.language ?? 'en',
    noisyAudio: options.noisyAudio ?? false,
    multipleSpeakers: options.multipleSpeakers ?? false,
    isInterruption: options.isInterruption ?? false,
    timestamp: Date.now(),
  }

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`CALLER: "${transcript}"`)

  const response = await fetch(`${WORKER_URL}/voice/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Worker returned ${response.status}: ${errorText}`)
  }

  const result = await response.json() as AgentResponsePayload

  console.log(`AGENT: "${result.message}"`)
  console.log(`  → Intent: ${result.intent} | Step: ${result.workflowStep} | ${result.latency.totalResponseMs}ms total`)

  return result
}

async function runBuiltinEvaluation(): Promise<void> {
  console.log(`\n${'='.repeat(60)}`)
  console.log('RUNNING BUILT-IN EVALUATION SUITE...')
  console.log('='.repeat(60))

  const response = await fetch(`${WORKER_URL}/evaluate`, { method: 'POST' })
  if (!response.ok) {
    console.error('Evaluation failed:', await response.text())
    return
  }

  const summary = await response.json() as {
    totalTests: number
    passed: number
    failed: number
    passRate: number
    avgLatencyMs: number
    overallScore: number
    avgIntentAccuracy: number
    results: Array<{
      testCaseId: string
      description: string
      passed: boolean
      notes: string[]
    }>
  }

  console.log(`\nEVALUATION RESULTS:`)
  console.log(`  Tests: ${summary.totalTests} | Passed: ${summary.passed} | Failed: ${summary.failed}`)
  console.log(`  Pass Rate: ${(summary.passRate * 100).toFixed(1)}%`)
  console.log(`  Overall Score: ${(summary.overallScore * 100).toFixed(1)}%`)
  console.log(`  Intent Accuracy: ${(summary.avgIntentAccuracy * 100).toFixed(1)}%`)
  console.log(`  Avg Latency: ${summary.avgLatencyMs.toFixed(0)}ms`)

  console.log('\nPER-TEST RESULTS:')
  for (const result of summary.results) {
    const icon = result.passed ? '✓' : '✗'
    console.log(`  ${icon} [${result.testCaseId}] ${result.description}`)
    if (result.notes.length > 0) {
      result.notes.forEach(note => console.log(`      → ${note}`))
    }
  }
}

async function main(): Promise<void> {
  console.log('='.repeat(60))
  console.log('TECHVISTA — Restaurant Voice Agent Sample Call')
  console.log(`Session ID: ${SESSION_ID}`)
  console.log(`Worker URL: ${WORKER_URL}`)
  console.log('='.repeat(60))

  // Check that the Worker is running
  try {
    const health = await fetch(`${WORKER_URL}/health`)
    const healthData = await health.json() as { status: string; mockMode: boolean; model: string }
    console.log(`\nWorker health: ${healthData.status} | Mock mode: ${healthData.mockMode} | Model: ${healthData.model}`)
  } catch {
    console.error(`\nERROR: Cannot connect to Worker at ${WORKER_URL}`)
    console.error('Make sure to run "npm run dev" before running this script.')
    process.exit(1)
  }

  console.log('\n--- SIMULATING A COMPLETE RESERVATION CALL ---')

  const latencies: number[] = []

  // Turn 1: Initial greeting
  const t1 = await sendEvent("Hi, I'd like to make a reservation please")
  latencies.push(t1.latency.totalResponseMs)

  // Turn 2: Provide party size (often said in turn 1 or quickly after)
  const t2 = await sendEvent("2 people")
  latencies.push(t2.latency.totalResponseMs)

  // Turn 3: Provide date
  const t3 = await sendEvent("This Saturday")
  latencies.push(t3.latency.totalResponseMs)

  // Turn 4: Provide time
  const t4 = await sendEvent("7:30 pm")
  latencies.push(t4.latency.totalResponseMs)

  // Turn 5: Provide name
  const t5 = await sendEvent("My name is Sarah Johnson")
  latencies.push(t5.latency.totalResponseMs)

  // Turn 6: Provide phone number
  const t6 = await sendEvent("My number is 555-867-5309")
  latencies.push(t6.latency.totalResponseMs)

  // Turn 7: Confirm all details
  const t7 = await sendEvent("Yes, that's all correct. Please confirm it.")
  latencies.push(t7.latency.totalResponseMs)

  // Print call summary
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length
  const maxLatency = Math.max(...latencies)

  console.log(`\n${'='.repeat(60)}`)
  console.log('CALL SUMMARY:')
  console.log(`  Turns completed: ${latencies.length}`)
  console.log(`  Avg response time: ${avgLatency.toFixed(0)}ms`)
  console.log(`  Max response time: ${maxLatency.toFixed(0)}ms`)
  console.log(`  Target: 2000ms`)
  console.log(`  Status: ${maxLatency < 2000 ? 'ALL TURNS WITHIN TARGET' : 'SOME TURNS EXCEEDED TARGET'}`)

  // Get and print final session state
  try {
    const sessionResponse = await fetch(`${WORKER_URL}/session/${SESSION_ID}`)
    const session = await sessionResponse.json() as {
      reservation: {
        partySize?: number
        date?: string
        time?: string
        name?: string
        phone?: string
        confirmed?: boolean
      }
    }
    console.log('\nFINAL RESERVATION:')
    console.log(`  Party size: ${session.reservation.partySize ?? 'N/A'}`)
    console.log(`  Date: ${session.reservation.date ?? 'N/A'}`)
    console.log(`  Time: ${session.reservation.time ?? 'N/A'}`)
    console.log(`  Name: ${session.reservation.name ?? 'N/A'}`)
    console.log(`  Phone: ${session.reservation.phone ?? 'N/A'}`)
    console.log(`  Confirmed: ${session.reservation.confirmed ?? false}`)
  } catch {
    console.log('\n(Could not fetch session state)')
  }

  // Run the built-in evaluation suite
  await runBuiltinEvaluation()

  console.log('\nDone.')
}

main().catch(console.error)
