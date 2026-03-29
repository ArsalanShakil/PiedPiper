/**
 * Normalize question options from API.
 * Pre-generated questions use {"A": "text", "B": "text"} format.
 * Story questions use ["option1", "option2"] format.
 * Returns a flat string array suitable for rendering radio buttons.
 */
export function normalizeOptions(options: unknown): string[] {
  if (!options) return []
  if (Array.isArray(options)) return options.map(String)
  if (typeof options === 'object') {
    // Dict format: {"A": "In Malmö", "B": "In Stockholm"}
    return Object.entries(options as Record<string, string>).map(
      ([key, val]) => `${key}. ${val}`
    )
  }
  return []
}
