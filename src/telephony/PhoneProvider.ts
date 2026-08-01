

export interface IncomingCallEvent {
  callSid: string       // Unique call identifier from the phone provider
  from: string          // Caller's phone number
  to: string            // Restaurant's phone number (the called number)
  transcript?: string   // Pre-transcribed speech (if provider does STT)
  confidence?: number   // Transcription confidence from provider
}

export interface CallSession {
  callSid: string
  from: string
  to: string
  startTime: number     // Unix ms when the call started
}

export interface PhoneProvider {
  /**
   * Handle an incoming call event from the phone provider.
   * This is called when the provider sends a webhook to your Worker URL.
   */
  handleIncomingCall(event: IncomingCallEvent): Promise<void>

  /**
   * Send a text response to be spoken on the active call.
   * The provider converts text to speech and plays it to the caller.
   */
  sendResponse(sessionId: string, response: string): Promise<void>

  /**
   * End the call programmatically.
   */
  endCall(sessionId: string): Promise<void>
}
