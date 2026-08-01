import type { WorkflowStep, ReservationDetails } from '../types/index'

export class ReservationWorkflow {
  getNextStep(reservation: ReservationDetails): WorkflowStep {
    if (!reservation.partySize) return 'ask_party_size'
    if (!reservation.date) return 'ask_date'
    if (!reservation.time) return 'ask_time'
    if (!reservation.name) return 'ask_name'
    if (!reservation.phone) return 'ask_phone'
    if (!reservation.confirmed) return 'confirm_details'
    return 'completed'
  }

  extractField(step: WorkflowStep, userMessage: string): Partial<ReservationDetails> {
    const msg = userMessage.toLowerCase().trim()

    switch (step) {
      case 'ask_party_size': {
        // Match patterns like "2", "two", "for 6", "party of 4"
        const wordNumbers: Record<string, number> = {
          one: 1, two: 2, three: 3, four: 4, five: 5,
          six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
        }
        for (const [word, num] of Object.entries(wordNumbers)) {
          if (msg.includes(word)) return { partySize: num }
        }
        const digitMatch = msg.match(/\b(\d+)\b/)
        if (digitMatch) return { partySize: parseInt(digitMatch[1], 10) }
        return {}
      }

      case 'ask_date': {
        // Handle relative dates
        if (msg.includes('today')) return { date: 'today' }
        if (msg.includes('tomorrow')) return { date: 'tomorrow' }

        // Handle day names
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        for (const day of days) {
          if (msg.includes(day)) return { date: day }
        }

        // Handle MM/DD or MM-DD patterns
        const dateMatch = msg.match(/(\d{1,2})[\/\-](\d{1,2})/)
        if (dateMatch) return { date: `${dateMatch[1]}-${dateMatch[2]}` }

        // Handle "the 15th", "15th", "March 15"
        const ordinalMatch = msg.match(/(\d{1,2})(?:st|nd|rd|th)/)
        if (ordinalMatch) return { date: `day-${ordinalMatch[1]}` }

        return {}
      }

      case 'ask_time': {
        // Handle "7pm", "7:30pm", "7 pm", "19:00"
        const timeMatch = msg.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
        if (timeMatch) {
          let hours = parseInt(timeMatch[1], 10)
          const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0
          const meridiem = timeMatch[3]?.toLowerCase()

          if (meridiem === 'pm' && hours < 12) hours += 12
          if (meridiem === 'am' && hours === 12) hours = 0

          const formatted = `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
          return { time: formatted }
        }

        // Handle word-based times
        if (msg.includes('noon')) return { time: '12:00 PM' }
        if (msg.includes('midnight')) return { time: '12:00 AM' }
        return {}
      }

      case 'ask_name': {
        // Match "my name is [name]", "it's [name]", "this is [name]"
        const namePatterns = [
          /my name is ([a-z]+(?:\s+[a-z]+)?)/i,
          /(?:it'?s|this is|i'm|i am)\s+([a-z]+(?:\s+[a-z]+)?)/i,
          /^([a-z]+(?:\s+[a-z]+)?)$/i,  // Bare name response
        ]
        for (const pattern of namePatterns) {
          const match = msg.match(pattern)
          if (match) {
            // Capitalize each word in the name
            const name = match[1].replace(/\b\w/g, c => c.toUpperCase())
            return { name }
          }
        }
        return {}
      }

      case 'ask_phone': {
        // Remove all non-digit characters and check if it looks like a phone number
        const digits = msg.replace(/\D/g, '')
        if (digits.length >= 10) {
          // Format as (XXX) XXX-XXXX
          const d = digits.slice(-10)
          return { phone: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` }
        }
        return {}
      }

      case 'confirm_details': {
        // Check for confirmation words
        const confirmWords = ['yes', 'correct', 'right', 'confirm', 'perfect', 'good', 'ok', 'sure', 'yep', 'yeah']
        const cancelWords = ['no', 'wrong', 'change', 'different', 'not', 'incorrect']

        if (confirmWords.some(word => msg.includes(word))) {
          return { confirmed: true }
        }
        if (cancelWords.some(word => msg.includes(word))) {
          return { confirmed: false }
        }
        return {}
      }

      default:
        return {}
    }
  }

  buildPrompt(step: WorkflowStep, reservation: ReservationDetails, userMessage: string): string {
    const context = this.formatReservationContext(reservation)

    const basePrompt = `You are a friendly restaurant phone agent for Bella Vista, an Italian-American restaurant.
You are helping a caller make a reservation. Keep your responses SHORT — 1-2 sentences only.
This is a phone call, so be conversational and natural.

Current reservation details collected so far:
${context}

The caller just said: "${userMessage}"
`

    const stepInstructions: Record<WorkflowStep, string> = {
      ask_party_size: 'Ask how many people will be dining. Be friendly and brief.',
      ask_date:       'The party size is confirmed. Ask what date they would like to dine.',
      ask_time:       'The date is confirmed. Ask what time they prefer.',
      ask_name:       'The time is confirmed. Ask for the name for the reservation.',
      ask_phone:      'The name is noted. Ask for a phone number for the reservation.',
      confirm_details: `Read back ALL details and ask the caller to confirm:\n${this.getConfirmationText(reservation)}`,
      completed:      'Thank the caller, confirm the reservation is booked, and ask if there is anything else.',
      idle:           'Greet the caller and ask how you can help.',
    }

    return `${basePrompt}\nYour task: ${stepInstructions[step]}`
  }

  getConfirmationText(reservation: ReservationDetails): string {
    const lines: string[] = ['Here are your reservation details:']
    if (reservation.partySize) lines.push(`  - Party size: ${reservation.partySize} guests`)
    if (reservation.date)      lines.push(`  - Date: ${reservation.date}`)
    if (reservation.time)      lines.push(`  - Time: ${reservation.time}`)
    if (reservation.name)      lines.push(`  - Name: ${reservation.name}`)
    if (reservation.phone)     lines.push(`  - Phone: ${reservation.phone}`)
    return lines.join('\n')
  }

  private formatReservationContext(reservation: ReservationDetails): string {
    const parts: string[] = []
    if (reservation.partySize) parts.push(`Party size: ${reservation.partySize}`)
    if (reservation.date)      parts.push(`Date: ${reservation.date}`)
    if (reservation.time)      parts.push(`Time: ${reservation.time}`)
    if (reservation.name)      parts.push(`Name: ${reservation.name}`)
    if (reservation.phone)     parts.push(`Phone: ${reservation.phone}`)
    return parts.length > 0 ? parts.join(', ') : 'Nothing collected yet'
  }

  isComplete(reservation: ReservationDetails): boolean {
    return Boolean(
      reservation.partySize &&
      reservation.date &&
      reservation.time &&
      reservation.name &&
      reservation.phone &&
      reservation.confirmed
    )
  }
}
