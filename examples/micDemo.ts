//npm run dev 
//npm run demo:mic

import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const WORKER_URL = 'http://localhost:8787'
const PORT = 8788
function loadDotEnv(): void {
  const envPath = join(__dirname, '..', '.env')
  if (!existsSync(envPath)) return

  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

loadDotEnv()

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? ''
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'Rachel'

if (!ELEVENLABS_API_KEY) {
  console.error('ERROR: ELEVENLABS_API_KEY is not set (checked shell env and .env).')
  process.exit(1)
}

async function transcribeAudio(audio: Buffer, mimeType: string): Promise<{ text: string; confidence: number; language: string }> {
  const form = new FormData()
  form.append('model_id', 'scribe_v1')
  form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), 'audio.webm')

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    body: form,
  })

  if (!response.ok) {
    throw new Error(`ElevenLabs STT error ${response.status}: ${await response.text()}`)
  }

  const data = await response.json() as { text?: string; language_code?: string; language_probability?: number }
  return {
    text: data.text ?? '',
    confidence: data.language_probability ?? 0.9,
    language: data.language_code ?? 'en',
  }
}

async function synthesizeSpeech(text: string): Promise<Buffer> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })

  if (!response.ok) {
    throw new Error(`ElevenLabs TTS error ${response.status}: ${await response.text()}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

interface AgentResponsePayload {
  message: string
  intent: string
  workflowStep: string
  shouldEndCall: boolean
  requiresHumanHandoff: boolean
  latency: { totalResponseMs: number; llmMs: number; routingMs: number; ttsMs: number; validationMs: number }
}

async function sendToWorker(sessionId: string, transcript: string, confidence: number, language: string): Promise<AgentResponsePayload> {
  const response = await fetch(`${WORKER_URL}/voice/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      transcript,
      confidence,
      language,
      timestamp: Date.now(),
    }),
  })

  if (!response.ok) {
    throw new Error(`Worker returned ${response.status}: ${await response.text()}`)
  }

  return response.json() as Promise<AgentResponsePayload>
}

//single page UI
const PAGE_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>TechVista Mic Demo</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; }
  button { font-size: 18px; padding: 16px 32px; border-radius: 8px; border: none; cursor: pointer; }
  #recordBtn { background: #c0392b; color: white; }
  #recordBtn.recording { background: #27ae60; }
  #log { margin-top: 24px; white-space: pre-wrap; font-family: monospace; font-size: 13px; background: #f4f4f4; padding: 12px; border-radius: 8px; min-height: 200px; }
</style>
</head>
<body>
  <h1>TechVista — Mic Demo</h1>
  <p>Hold the button, speak, release to send. Requires mic permission.</p>
  <button id="recordBtn">Hold to talk</button>
  <div id="log"></div>
  <audio id="player"></audio>
<script>
const sessionId = 'mic-demo-' + Date.now()
const btn = document.getElementById('recordBtn')
const logEl = document.getElementById('log')
const player = document.getElementById('player')
let mediaRecorder, chunks = []

function appendLog(line) {
  logEl.textContent += line + '\\n'
  logEl.scrollTop = logEl.scrollHeight
}

async function start() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  mediaRecorder = new MediaRecorder(stream)
  chunks = []
  mediaRecorder.ondataavailable = e => chunks.push(e.data)
  mediaRecorder.onstop = onStop
  mediaRecorder.start()
  btn.classList.add('recording')
  btn.textContent = 'Recording... release to send'
}

async function onStop() {
  btn.classList.remove('recording')
  btn.textContent = 'Sending...'
  const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' })

  try {
    const res = await fetch('/api/turn', {
      method: 'POST',
      headers: { 'Content-Type': blob.type, 'x-session-id': sessionId },
      body: blob,
    })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()

    appendLog('YOU: "' + data.transcript + '" (confidence ' + data.confidence.toFixed(2) + ')')
    appendLog('AGENT: "' + data.message + '"')
    appendLog('  intent=' + data.intent + ' step=' + data.workflowStep + ' totalMs=' + data.latency.totalResponseMs)
    appendLog('')

    if (data.audioBase64) {
      player.src = 'data:audio/mpeg;base64,' + data.audioBase64
      player.play()
    }
  } catch (err) {
    appendLog('ERROR: ' + err.message)
  } finally {
    btn.textContent = 'Hold to talk'
  }
}

btn.addEventListener('mousedown', start)
btn.addEventListener('mouseup', () => mediaRecorder && mediaRecorder.stop())
btn.addEventListener('mouseleave', () => mediaRecorder && mediaRecorder.state === 'recording' && mediaRecorder.stop())
</script>
</body>
</html>`

async function readRequestBody(req: import('http').IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(PAGE_HTML)
    return
  }

  if (req.method === 'POST' && req.url === '/api/turn') {
    try {
      const sessionId = (req.headers['x-session-id'] as string) || 'mic-demo-default'
      const mimeType = req.headers['content-type'] || 'audio/webm'
      const audio = await readRequestBody(req)

      const stt = await transcribeAudio(audio, mimeType)
      const agentResponse = await sendToWorker(sessionId, stt.text, stt.confidence, stt.language)
      const ttsAudio = await synthesizeSpeech(agentResponse.message)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        transcript: stt.text,
        confidence: stt.confidence,
        message: agentResponse.message,
        intent: agentResponse.intent,
        workflowStep: agentResponse.workflowStep,
        latency: agentResponse.latency,
        audioBase64: ttsAudio.toString('base64'),
      }))
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Turn failed:', message)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: message }))
    }
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

async function main(): Promise<void> {
  try {
    const health = await fetch(`${WORKER_URL}/health`)
    if (!health.ok) throw new Error(`status ${health.status}`)
  } catch {
    console.error(`ERROR: Cannot reach Worker at ${WORKER_URL}.`)
    console.error('Start it first in another terminal with: npm run dev')
    process.exit(1)
  }

  server.listen(PORT, () => {
    console.log(`Mic demo ready: http://localhost:${PORT}`)
    console.log(`Forwarding agent turns to Worker at ${WORKER_URL}`)
  })
}

main()
