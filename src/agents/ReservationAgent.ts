//Extract reservation fields from the user's message (code, not LLM)
//next step if the current field was filled
//Call LLM to generate a NATURAL LANGUAGE response for the current step
//Update session state with newly collected fields

import type { SessionState, WorkflowStep, AgentResponse, LatencyMetrics } from '../types/index'
import type { ModelProvider } from '../llm/types'
import type { AppConfig } from '../config/index'
import { ReservationWorkflow } from '../workflows/ReservationWorkflow'
import { log } from '../utils/logger'

export class ReservationAgent {
  private llm: ModelProvider
  private config: AppConfig
  private workflow: ReservationWorkflow

  constructor(llm: ModelProvider, config: AppConfig) {
    this.llm = llm
    this.config = config
    this.workflow = new ReservationWorkflow()
  }

  async process(
    session: SessionState,
    userMessage: string,
    latencyTracker: { start: (l: string) => void; end: (l: string) => void; getSummary: () => LatencyMetrics }
  ): Promise<{ message: string; updatedStep: WorkflowStep; shouldEndCall: boolean }> {

    const currentStep = session.workflowStep === 'idle' ? 'ask_party_size' : session.workflowStep
    const updatedReservation = this.extractWithLookahead(currentStep, session.reservation, userMessage)

    //Determine the next step based on what's now filled
    const nextStep = this.workflow.getNextStep(updatedReservation)

    log('info', 'ReservationAgent: workflow step', { currentStep, nextStep })

    //Build the prompt for the LLM (tell it what to say, not what to decide)
    const prompt = this.workflow.buildPrompt(nextStep, updatedReservation, userMessage)

    //Call LLM to phrase the response naturally
    latencyTracker.start('llm')
    const llmResponse = await this.llm.complete(
      [{ role: 'user', content: prompt }],
      { temperature: 0.4, maxTokens: 120 }
    )
    latencyTracker.end('llm')

    log('info', 'ReservationAgent: LLM response', { latencyMs: llmResponse.latencyMs })

    const shouldEndCall = nextStep === 'completed'

    return {
      message: llmResponse.content,
      updatedStep: nextStep,
      shouldEndCall,
    }
  }

  getUpdatedReservation(session: SessionState, userMessage: string) {
    const currentStep = session.workflowStep === 'idle' ? 'ask_party_size' : session.workflowStep
    return this.extractWithLookahead(currentStep, session.reservation, userMessage)
  }

  private extractWithLookahead(
    currentStep: WorkflowStep,
    existingReservation: SessionState['reservation'],
    userMessage: string
  ) {
    const extracted = this.workflow.extractField(currentStep, userMessage)
    let updated = { ...existingReservation, ...extracted }

    const lookaheadStep = this.workflow.getNextStep(updated)
    if (lookaheadStep !== currentStep) {
      const lookaheadExtracted = this.workflow.extractField(lookaheadStep, userMessage)
      if (Object.keys(lookaheadExtracted).length > 0) {
        log('info', 'ReservationAgent: lookahead extracted additional field', {
          currentStep, lookaheadStep, lookaheadExtracted,
        })
        updated = { ...updated, ...lookaheadExtracted }
      }
    }

    return updated
  }
}
