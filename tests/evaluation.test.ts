import { scoreIntent, scoreWorkflow, scoreReservationFields, scoreLatency } from '../src/evaluation/metrics'
import { ReservationWorkflow } from '../src/workflows/ReservationWorkflow'
import type { LatencyMetrics, Intent, WorkflowStep } from '../src/types/index'

function mockLatency(totalMs: number): LatencyMetrics {
  return {
    requestStartTime: Date.now(),
    transcriptionMs: 0,
    routingMs: 5,
    llmMs: totalMs - 5,
    validationMs: 2,
    ttsMs: 0,
    totalResponseMs: totalMs,
    ttftMs: null,
  }
}

describe('Evaluation Metrics', () => {
  describe('scoreIntent', () => {
    it('returns 1.0 when intent matches', () => {
      expect(scoreIntent('reservation', 'reservation')).toBe(1.0)
      expect(scoreIntent('menu', 'menu')).toBe(1.0)
    })

    it('returns 0.0 when intent does not match', () => {
      expect(scoreIntent('reservation', 'menu')).toBe(0.0)
      expect(scoreIntent('hours_location', 'unclear')).toBe(0.0)
    })
  })

  describe('scoreWorkflow', () => {
    it('returns 1.0 when steps match', () => {
      expect(scoreWorkflow('ask_party_size', 'ask_party_size')).toBe(1.0)
      expect(scoreWorkflow('confirm_details', 'confirm_details')).toBe(1.0)
    })

    it('returns 1.0 when no expected step provided', () => {
      expect(scoreWorkflow(undefined, 'ask_party_size')).toBe(1.0)
    })

    it('returns 0.5 for adjacent steps', () => {
      expect(scoreWorkflow('ask_party_size', 'ask_date')).toBe(0.5)
      expect(scoreWorkflow('ask_date', 'ask_party_size')).toBe(0.5)
    })

    it('returns 0.0 for non-adjacent steps', () => {
      expect(scoreWorkflow('ask_party_size', 'ask_name')).toBe(0.0)
    })
  })

  describe('scoreReservationFields', () => {
    it('returns 1.0 when all expected fields match', () => {
      const expected = { partySize: 2, date: 'tomorrow' }
      const actual = { partySize: 2, date: 'tomorrow', time: '7:00 PM' }
      expect(scoreReservationFields(expected, actual)).toBe(1.0)
    })

    it('returns partial credit for partial field matches', () => {
      const expected = { partySize: 2, date: 'tomorrow', time: '7:00 PM' }
      const actual = { partySize: 2 }
      expect(scoreReservationFields(expected, actual)).toBeCloseTo(1 / 3, 1)
    })

    it('returns 1.0 when no expected fields provided', () => {
      expect(scoreReservationFields(undefined, {})).toBe(1.0)
      expect(scoreReservationFields({}, { partySize: 3 })).toBe(1.0)
    })
  })

  describe('scoreLatency', () => {
    it('returns 1.0 when under target', () => {
      expect(scoreLatency(mockLatency(1500), 2000)).toBe(1.0)
      expect(scoreLatency(mockLatency(2000), 2000)).toBe(1.0)
    })

    it('returns 0.0 when at 2x target', () => {
      expect(scoreLatency(mockLatency(4000), 2000)).toBe(0.0)
    })

    it('returns 0.5 when halfway between target and 2x target', () => {
      expect(scoreLatency(mockLatency(3000), 2000)).toBeCloseTo(0.5, 1)
    })
  })
})

describe('ReservationWorkflow', () => {
  let workflow: ReservationWorkflow

  beforeEach(() => {
    workflow = new ReservationWorkflow()
  })

  describe('getNextStep', () => {
    it('asks for party size when nothing collected', () => {
      expect(workflow.getNextStep({})).toBe('ask_party_size')
    })

    it('asks for date after party size collected', () => {
      expect(workflow.getNextStep({ partySize: 2 })).toBe('ask_date')
    })

    it('asks for time after party size and date collected', () => {
      expect(workflow.getNextStep({ partySize: 2, date: 'tomorrow' })).toBe('ask_time')
    })

    it('returns completed when all fields confirmed', () => {
      const complete = { partySize: 2, date: 'tomorrow', time: '7pm', name: 'Alice', phone: '555-1234', confirmed: true }
      expect(workflow.getNextStep(complete)).toBe('completed')
    })
  })

  describe('extractField', () => {
    it('extracts party size from numeric message', () => {
      const result = workflow.extractField('ask_party_size', 'There will be 4 of us')
      expect(result.partySize).toBe(4)
    })

    it('extracts party size from word number', () => {
      const result = workflow.extractField('ask_party_size', 'Two people please')
      expect(result.partySize).toBe(2)
    })

    it('extracts "tomorrow" as date', () => {
      const result = workflow.extractField('ask_date', 'We would like tomorrow')
      expect(result.date).toBe('tomorrow')
    })

    it('extracts day name as date', () => {
      const result = workflow.extractField('ask_date', 'Saturday evening')
      expect(result.date).toBe('saturday')
    })

    it('extracts PM time', () => {
      const result = workflow.extractField('ask_time', '7pm please')
      expect(result.time).toContain('PM')
    })

    it('extracts name after "my name is"', () => {
      const result = workflow.extractField('ask_name', 'My name is Sarah')
      expect(result.name).toBe('Sarah')
    })

    it('extracts phone number', () => {
      const result = workflow.extractField('ask_phone', 'My number is 5558675309')
      expect(result.phone).toBeDefined()
      expect(result.phone).toContain('555')
    })

    it('recognizes confirmation', () => {
      const result = workflow.extractField('confirm_details', 'Yes that is correct')
      expect(result.confirmed).toBe(true)
    })

    it('recognizes denial', () => {
      const result = workflow.extractField('confirm_details', 'No the date is wrong')
      expect(result.confirmed).toBe(false)
    })
  })

  describe('isComplete', () => {
    it('returns false when fields are missing', () => {
      expect(workflow.isComplete({ partySize: 2 })).toBe(false)
    })

    it('returns true when all fields present and confirmed', () => {
      const complete = {
        partySize: 4,
        date: 'saturday',
        time: '7:00 PM',
        name: 'Alice',
        phone: '(555) 867-5309',
        confirmed: true,
      }
      expect(workflow.isComplete(complete)).toBe(true)
    })
  })
})
