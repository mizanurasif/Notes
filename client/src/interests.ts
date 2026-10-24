// "Chess, reading , music" → ["Chess", "reading", "music"]
// (the server also trims, lowercases and removes duplicates)
export function parseInterests(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
