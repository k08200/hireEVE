/**
 * Plain-text projection of an HTML email body.
 *
 * Why: extractBody only fills `body` from text/plain MIME parts, so HTML-only
 * mail persisted body=null and was permanently invisible to the summarizer
 * (`body: { not: null }`) — the "Klorn has not analyzed this email yet" dead
 * end. This helper turns htmlBody into safe plain text at persist/read time.
 *
 * Sanitization is done by sanitize-html (parser-based, not regex) — the
 * newline pre-pass below only inserts breaks and never acts as the sanitizer.
 * Anchor text is replaced with the href itself (http/https/mailto only):
 * verification links usually live in the href, not the visible text.
 */

import sanitizeHtml from "sanitize-html";

const SAFE_HREF = /^(https?:|mailto:)/i;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/ /g, " ");
}

// Sanitizing is synchronous, event-loop-blocking work with no natural bound —
// a multi-MB spam HTML must not stall the server on every read. 500KB keeps
// every legitimate email intact.
const MAX_HTML_INPUT = 500_000;

export function htmlToPlainText(html: string): string {
  if (!html || !html.trim()) return "";

  // Insert line breaks after block-level closes and <br> so paragraphs don't
  // collapse into one blob. Tags themselves are stripped by sanitize-html.
  const withBreaks = html
    .slice(0, MAX_HTML_INPUT)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)\s*>/gi, "$&\n");

  const text = sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
    // Surface the link TARGET: replace anchor children with the href so
    // "click here" becomes the actual verification URL. Unsafe schemes drop.
    transformTags: {
      a: (_tag, attribs) => ({
        tagName: "a",
        attribs: {},
        text:
          attribs.href && SAFE_HREF.test(attribs.href.trim()) ? ` ${attribs.href.trim()} ` : " ",
      }),
    },
  });

  return decodeEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Some senders ship a text/plain MIME part that actually contains raw HTML
 * source (observed 2026-08-13: Paddle's "Verify your identity" mail — Gmail
 * renders its html part, our reader trusted the plain part and displayed
 * tag soup). When the plain body is markup, the html part is the authority.
 *
 * The threshold is deliberately high: prose that merely mentions a couple of
 * tags (e.g. a dev explaining `<div>` usage) must pass through untouched.
 * Only bodies with a real density of block/table/style markup are coerced.
 */
const HTML_MARKUP_TOKEN = /<\/?(?:table|tbody|tr|td|div|p|span|h[1-6]|img|br|a\s)[^>]*>|style="/gi;
const MIN_MARKUP_TOKENS = 5;

function looksLikeRawHtml(text: string): boolean {
  const matches = text.match(HTML_MARKUP_TOKEN);
  return (matches?.length ?? 0) >= MIN_MARKUP_TOKENS;
}

/**
 * Return the body to store/serve as plain text: the plain part when it is
 * genuinely plain, otherwise the projection of the html part (or of the
 * body itself when no html part exists).
 */
export function coercePlainBody(body: string | null, htmlBody: string | null): string | null {
  if (!body || !looksLikeRawHtml(body)) return body;
  return htmlToPlainText(htmlBody || body);
}
