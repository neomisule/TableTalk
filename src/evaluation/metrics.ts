import type { EvalResult, EvalSummary, Intent, WorkflowStep, ReservationDetails, LatencyMetrics } from '../types/index'

// scoreIntent — 1.0 if intent matches, 0.0 if not
export function scoreIntent(expected: Intent, actual: Intent): number {
  return expected === actual ? 1.0 : 0.0
}

// scoreWorkflow — 1.0 if workflow step matches, 0.5 if close, 0.0 if wrong
export function scoreWorkflow(expected: WorkflowStep | undefined, actual: WorkflowStep): number {
  if (!expected) return 1.0  // No expectation = auto-pass
  if (expected === actual) return 1.0

  // Adjacent steps (one step off) get partial credit
  // This handles cases where extraction pulled more data than expected
  const stepOrder: WorkflowStep[] = [
    'idle', 'ask_party_size', 'ask_date', 'ask_time', 'ask_name', 'ask_phone', 'confirm_details', 'completed'
  ]
  const expectedIdx = stepOrder.indexOf(expected)
  const actualIdx = stepOrder.indexOf(actual)
  if (expectedIdx !== -1 && actualIdx !== -1 && Math.abs(expectedIdx - actualIdx) === 1) {
    return 0.5  // Adjacent step — partial credit
  }

  return 0.0
}

// scoreReservationFields — partial credit per matching field
export function scoreReservationFields(
  expected: Partial<ReservationDetails> | undefined,
  actualReservation: Partial<ReservationDetails>
): number {
  if (!expected || Object.keys(expected).length === 0) return 1.0

  const fields = Object.keys(expected) as (keyof ReservationDetails)[]
  let matched = 0

  for (const field of fields) {
    const expectedValue = expected[field]
    const actualValue = actualReservation[field]

    if (expectedValue === undefined) continue

    if (field === 'partySize') {
      matched += expectedValue === actualValue ? 1 : 0
    } else if (field === 'confirmed') {
      matched += expectedValue === actualValue ? 1 : 0
    } else {
      if (actualValue === undefined || actualValue === null || actualValue === '') {
        continue
      }
      // For strings, do a case-insensitive partial match
      const expectedStr = String(expectedValue).toLowerCase()
      const actualStr = String(actualValue).toLowerCase()
      if (actualStr.includes(expectedStr) || expectedStr.includes(actualStr)) {
        matched += 1
      }
    }
  }

  return matched / fields.length
}

// scoreLatency — 1.0 if under target, degrades linearly to 0.0 at 2x target
export function scoreLatency(latency: LatencyMetrics, targetMs: number): number {
  const total = latency.totalResponseMs
  if (total <= targetMs) return 1.0
  if (total >= targetMs * 2) return 0.0
  // Linear degradation between targetMs and 2*targetMs
  return 1.0 - (total - targetMs) / targetMs
}

// aggregateResults — compute summary statistics across all eval results
export function aggregateResults(results: EvalResult[], latencyTargetMs: number = 2000): EvalSummary {
  const total = results.length
  const passed = results.filter(r => r.passed).length
  const failed = total - passed

  const avgLatencyMs = total > 0
    ? results.reduce((sum, r) => sum + r.latency.totalResponseMs, 0) / total
    : 0

  const avgIntentAccuracy = total > 0
    ? results.reduce((sum, r) => sum + r.scores.intentAccuracy, 0) / total
    : 0

  const avgWorkflowAccuracy = total > 0
    ? results.reduce((sum, r) => sum + r.scores.workflowAccuracy, 0) / total
    : 0

  const avgReservationFieldAccuracy = total > 0
    ? results.reduce((sum, r) => sum + r.scores.reservationFieldAccuracy, 0) / total
    : 0

  const avgLatencyScore = total > 0
    ? results.reduce((sum, r) => sum + r.scores.latencyScore, 0) / total
    : 0

  // Weighted overall score:
  // Intent accuracy is most important (40%), then workflow (25%), fields (20%), latency (15%)
  const overallScore =
    avgIntentAccuracy * 0.40 +
    avgWorkflowAccuracy * 0.25 +
    avgReservationFieldAccuracy * 0.20 +
    avgLatencyScore * 0.15

  return {
    totalTests: total,
    passed,
    failed,
    passRate: total > 0 ? passed / total : 0,
    avgLatencyMs,
    avgIntentAccuracy,
    avgWorkflowAccuracy,
    avgReservationFieldAccuracy,
    avgLatencyScore,
    overallScore,
    results,
  }
}
