/**
 * Extract a centered snippet around the first occurrence of `query` in `content`,
 * and report the positions of every occurrence within the returned snippet so the
 * frontend can highlight them.
 */

export interface Highlight {
  /** Start index within the returned snippet text (inclusive) */
  start: number;
  /** End index within the returned snippet text (exclusive) */
  end: number;
}

export interface Snippet {
  text: string;
  highlights: Highlight[];
}

const ELLIPSIS = "…";

export function extractSnippet(content: string, query: string, maxLength: number): Snippet {
  if (!query) {
    return { text: truncateTail(content, maxLength), highlights: [] };
  }

  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const firstIdx = lowerContent.indexOf(lowerQuery);

  if (firstIdx === -1) {
    return { text: truncateTail(content, maxLength), highlights: [] };
  }

  if (content.length <= maxLength) {
    return {
      text: content,
      highlights: findAllMatches(lowerContent, lowerQuery, 0, content.length),
    };
  }

  const half = Math.floor(maxLength / 2);
  const windowStart = Math.max(0, firstIdx - half);
  const windowEnd = Math.min(content.length, windowStart + maxLength);
  // If we hit the end, shift the window back so it uses the full maxLength.
  const adjustedStart = Math.max(0, windowEnd - maxLength);

  const sliceText = content.slice(adjustedStart, windowEnd);
  const prefix = adjustedStart > 0 ? ELLIPSIS : "";
  const suffix = windowEnd < content.length ? ELLIPSIS : "";
  const text = prefix + sliceText + suffix;

  const absoluteMatches = findAllMatches(lowerContent, lowerQuery, adjustedStart, windowEnd);
  const highlights = absoluteMatches.map(({ start, end }) => ({
    start: start - adjustedStart + prefix.length,
    end: end - adjustedStart + prefix.length,
  }));

  return { text, highlights };
}

function findAllMatches(
  lowerContent: string,
  lowerQuery: string,
  from: number,
  to: number,
): Highlight[] {
  const matches: Highlight[] = [];
  const qlen = lowerQuery.length;
  let cursor = from;
  while (cursor < to) {
    const idx = lowerContent.indexOf(lowerQuery, cursor);
    if (idx === -1 || idx + qlen > to) break;
    matches.push({ start: idx, end: idx + qlen });
    cursor = idx + qlen;
  }
  return matches;
}

function truncateTail(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + ELLIPSIS;
}
