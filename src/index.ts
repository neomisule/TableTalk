import type { VoiceEvent } from './types/index'
import type { Env } from './config/index'
import { getConfig } from './config/index'
import { processVoiceEvent } from './agents/index'
import { sessionStore } from './state/index'
import { runEvaluation } from './evaluation/runner'
import { TEST_CASES } from './evaluation/testCases'
import { log } from './utils/logger'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function corsResponse(body: string, status: number = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  })
}

function jsonOk(data: unknown): Response {
  return corsResponse(JSON.stringify(data, null, 2))
}

function jsonError(message: string, status: number = 400): Response {
  return corsResponse(JSON.stringify({ error: message }), status)
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const config = getConfig(env)

    log('info', `${request.method} ${url.pathname}`, { model: config.groqModel })

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    try {
      if (request.method === 'POST' && url.pathname === '/voice/event') {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return jsonError('Request body must be valid JSON')
        }

        // Validate required fields
        const event = body as Partial<VoiceEvent>
        if (!event.sessionId || typeof event.sessionId !== 'string') {
          return jsonError('Missing required field: sessionId (string)')
        }
        if (typeof event.transcript !== 'string') {
          return jsonError('Missing required field: transcript (string)')
        }
        if (typeof event.confidence !== 'number') {
          return jsonError('Missing required field: confidence (number between 0 and 1)')
        }
        if (typeof event.timestamp !== 'number') {
          return jsonError('Missing required field: timestamp (Unix ms number)')
        }

        const voiceEvent: VoiceEvent = {
          sessionId: event.sessionId,
          transcript: event.transcript,
          confidence: event.confidence,
          timestamp: event.timestamp,
          language: event.language,
          noisyAudio: event.noisyAudio ?? false,
          multipleSpeakers: event.multipleSpeakers ?? false,
          isInterruption: event.isInterruption ?? false,
        }

        const agentResponse = await processVoiceEvent(voiceEvent, config, env)
        return jsonOk(agentResponse)
      }

      if (request.method === 'POST' && url.pathname === '/evaluate') {
        log('info', 'Starting evaluation suite', { testCount: TEST_CASES.length })
        const summary = await runEvaluation(TEST_CASES, config, env)
        return jsonOk(summary)
      }

      if (request.method === 'GET' && url.pathname === '/health') {
        return jsonOk({
          status: 'ok',
          model: config.groqModel,
          supportedLanguages: config.supportedLanguages,
          latencyTargetMs: config.latencyTargetMs,
          activeSessions: sessionStore.list().length,
          timestamp: Date.now(),
        })
      }

      const sessionMatch = url.pathname.match(/^\/session\/(.+)$/)
      if (request.method === 'GET' && sessionMatch) {
        const sessionId = sessionMatch[1]
        const session = sessionStore.get(sessionId)
        if (!session) {
          return jsonError(`Session '${sessionId}' not found`, 404)
        }
        return jsonOk(session)
      }

      if (request.method === 'GET' && url.pathname === '/sessions') {
        const sessions = sessionStore.list()
        return jsonOk({ count: sessions.length, sessions })
      }

      return jsonError(
        `Route not found: ${request.method} ${url.pathname}. ` +
        `Available routes: POST /voice/event, POST /evaluate, GET /health, GET /session/:id`,
        404
      )

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const stack = error instanceof Error ? error.stack : undefined
      log('error', 'Unhandled error in fetch handler', { error: errorMessage, stack })

      return jsonError(`Internal server error: ${errorMessage}`, 500)
    }
  },
}
