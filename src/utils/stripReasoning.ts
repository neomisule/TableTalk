const CLOSED_THINK_TAG = /<think>[\s\S]*?<\/think>/gi
const UNCLOSED_THINK_TAG = /<think>[\s\S]*$/i

export function stripReasoningTags(content: string): string {
  const withClosedTagsRemoved = content.replace(CLOSED_THINK_TAG, '')
  return withClosedTagsRemoved.replace(UNCLOSED_THINK_TAG, '').trim()
}

export function containsReasoningTag(content: string): boolean {
  return /<think/i.test(content)
}
