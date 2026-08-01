export { SessionStore } from './SessionStore'
export type { SessionState } from '../types/index'

import { SessionStore } from './SessionStore'

// The singleton store used by the default fetch handler
export const sessionStore = new SessionStore()
