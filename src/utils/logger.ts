type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(data ? { data } : {}),
  }

  switch (level) {
    case 'error':
      console.error(JSON.stringify(entry))
      break
    case 'warn':
      console.warn(JSON.stringify(entry))
      break
    case 'debug':
      console.debug(JSON.stringify(entry))
      break
    case 'info':
    default:
      console.log(JSON.stringify(entry))
  }
}
