import type { PhoneProvider, IncomingCallEvent } from './PhoneProvider'

class NotImplementedError extends Error {
  constructor(methodName: string) {
    super(
      `TwilioProviderPlaceholder.${methodName}() is not yet implemented. ` +
      `See src/telephony/TwilioPlaceholder.ts for implementation instructions.`
    )
    this.name = 'NotImplementedError'
  }
}

export class TwilioProviderPlaceholder implements PhoneProvider {
  async handleIncomingCall(_event: IncomingCallEvent): Promise<void> {
    throw new NotImplementedError('handleIncomingCall')
  }

  async sendResponse(_sessionId: string, _response: string): Promise<void> {
    throw new NotImplementedError('sendResponse')
  }

  async endCall(_sessionId: string): Promise<void> {
    throw new NotImplementedError('endCall')
  }
}
