/**
 * Cleans wiki-specific garbage content from strings.
 *
 * This handles cases where the wiki scraper includes embedded CSS,
 * template markers, or map-related noise (e.g., .mw-parser-output)
 * that slipped into the text output.
 */
export function cleanWikiGarbage(text: string): string {
  if (!text) return text;

  // 1. Strip CSS blocks if they leaked in (usually starts with .mw-parser-output)
  // We look for patterns like .something { ... }
  // Often multiple blocks are mashed together.
  let cleaned = text;

  if (cleaned.includes('.mw-parser-output')) {
    // This regex looks for CSS class selectors followed by brace blocks.
    // We replace the entire CSS block with nothing.
    // We look for a pattern that ends with a closing brace followed by some text.
    // The garbage typically ends just before the real human-readable text.

    // If it starts with a dot and contains braces, it's likely CSS.
    // Example: ".mw-parser-output .foo{...} REAL TEXT"
    // We strip everything up to the last closing brace of the CSS block.
    const lastBraceIndex = cleaned.lastIndexOf('}');
    if (lastBraceIndex !== -1) {
      cleaned = cleaned.substring(lastBraceIndex + 1).trim();
    } else {
      // Fallback: if there are no braces but it starts with mw-parser-output
      // it might be a malformed CSS string.
      // We try to find where the "real" text starts.
      // CSS properties rarely contain spaces like "Manual" or "Normal tree".
      // But this is risky. Let's stick to the brace logic first as it's common.
    }
  }

  // 2. Filter out other common wiki layout junk strings
  // (e.g. [[File:Pixel.png|link=]])
  cleaned = cleaned.replace(/\[\[File:.*?\]\]/g, '');

  return cleaned.trim();
}
