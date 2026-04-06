/**
 * Utility tools — free, no API key required
 *
 * - Translation (MyMemory API)
 * - URL shortener (is.gd)
 * - Calculator (math expression evaluator)
 * - Currency conversion (ECB rates)
 * - Random UUID/password generator
 */

// ── Translation via MyMemory (5000 chars/day free) ──────────────────

export async function translate(
  text: string,
  from: string,
  to: string,
): Promise<{ translated: string; from: string; to: string } | { error: string }> {
  const langPair = `${from}|${to}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langPair)}`;

  const res = await fetch(url);
  const data = (await res.json()) as {
    responseStatus: number;
    responseData: { translatedText: string };
  };

  if (data.responseStatus !== 200) {
    return { error: `Translation failed (status ${data.responseStatus})` };
  }

  return { translated: data.responseData.translatedText, from, to };
}

// ── URL Shortener via is.gd (free, no API key) ─────────────────────

export async function shortenUrl(url: string): Promise<{ shortUrl: string } | { error: string }> {
  const apiUrl = `https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`;
  const res = await fetch(apiUrl);
  const data = (await res.json()) as {
    shorturl?: string;
    errorcode?: number;
    errormessage?: string;
  };

  if (data.shorturl) {
    return { shortUrl: data.shorturl };
  }
  return { error: data.errormessage || "URL shortening failed" };
}

// ── Calculator (safe math expression evaluator — no eval/Function) ───

/**
 * Recursive descent parser for safe math evaluation.
 * Supports: +, -, *, /, %, ^ (power), parentheses, unary minus.
 * No eval(), no Function(), no code execution.
 */
function parseMathExpr(input: string): number {
  let pos = 0;
  const str = input.replace(/\s/g, "");

  function parseExpr(): number {
    let left = parseTerm();
    while (pos < str.length && (str[pos] === "+" || str[pos] === "-")) {
      const op = str[pos++];
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parsePower();
    while (pos < str.length && (str[pos] === "*" || str[pos] === "/" || str[pos] === "%")) {
      const op = str[pos++];
      const right = parsePower();
      if (op === "*") left *= right;
      else if (op === "/") {
        if (right === 0) throw new Error("Division by zero");
        left /= right;
      } else left %= right;
    }
    return left;
  }

  function parsePower(): number {
    let base = parseUnary();
    if (pos < str.length && str[pos] === "^") {
      pos++;
      const exp = parsePower(); // right-associative
      base = base ** exp;
    }
    return base;
  }

  function parseUnary(): number {
    if (str[pos] === "-") {
      pos++;
      return -parseAtom();
    }
    if (str[pos] === "+") pos++;
    return parseAtom();
  }

  function parseAtom(): number {
    if (str[pos] === "(") {
      pos++; // skip '('
      const val = parseExpr();
      if (str[pos] !== ")") throw new Error("Missing closing parenthesis");
      pos++; // skip ')'
      return val;
    }
    // Parse number (integer or decimal)
    const start = pos;
    while (pos < str.length && ((str[pos] >= "0" && str[pos] <= "9") || str[pos] === ".")) pos++;
    if (pos === start) throw new Error(`Unexpected character: ${str[pos] || "end of expression"}`);
    const num = Number(str.slice(start, pos));
    if (!Number.isFinite(num)) throw new Error("Invalid number");
    return num;
  }

  const result = parseExpr();
  if (pos < str.length) throw new Error(`Unexpected character: ${str[pos]}`);
  return result;
}

export function calculate(
  expression: string,
): { result: number; expression: string } | { error: string } {
  // Whitelist: only allow numbers, operators, parentheses, spaces, dots
  const sanitized = expression.replace(/\s/g, "");
  if (!/^[0-9+\-*/().,%^]+$/.test(sanitized)) {
    return { error: "Invalid expression. Only numbers and +, -, *, /, (), ^, % are allowed." };
  }

  try {
    const result = parseMathExpr(sanitized);

    if (typeof result !== "number" || !Number.isFinite(result)) {
      return { error: "Calculation resulted in invalid number" };
    }

    return { result, expression };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { error: `Failed to evaluate: ${msg}` };
  }
}

// ── Currency Conversion via ECB (free) ──────────────────────────────

let ratesCache: { rates: Record<string, number>; fetchedAt: number } | null = null;

async function getExchangeRates(): Promise<Record<string, number>> {
  // Cache for 1 hour
  if (ratesCache && Date.now() - ratesCache.fetchedAt < 3600_000) {
    return ratesCache.rates;
  }

  const res = await fetch(
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
  );
  const data = (await res.json()) as { usd: Record<string, number> };

  const rates = data.usd || {};
  ratesCache = { rates, fetchedAt: Date.now() };
  return rates;
}

export async function convertCurrency(
  amount: number,
  from: string,
  to: string,
): Promise<{ result: number; rate: number; from: string; to: string } | { error: string }> {
  const rates = await getExchangeRates();
  const fromLower = from.toLowerCase();
  const toLower = to.toLowerCase();

  // Convert to USD first, then to target
  let inUsd: number;
  if (fromLower === "usd") {
    inUsd = amount;
  } else if (rates[fromLower]) {
    inUsd = amount / rates[fromLower];
  } else {
    return { error: `Unknown currency: ${from}` };
  }

  let result: number;
  if (toLower === "usd") {
    result = inUsd;
  } else if (rates[toLower]) {
    result = inUsd * rates[toLower];
  } else {
    return { error: `Unknown currency: ${to}` };
  }

  const rate = result / amount;
  return {
    result: Math.round(result * 100) / 100,
    rate: Math.round(rate * 10000) / 10000,
    from,
    to,
  };
}

// ── Random generators ───────────────────────────────────────────────

export function generatePassword(length = 16): { password: string } {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  const password = Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
  return { password };
}

// ── Tool Definitions ────────────────────────────────────────────────

export const UTILITY_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "translate_text",
      description:
        "Translate text between languages. Use ISO 639-1 codes: ko (Korean), en (English), ja (Japanese), zh (Chinese), es (Spanish), fr (French), de (German), etc.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to translate" },
          from: { type: "string", description: "Source language code (e.g. 'ko', 'en', 'ja')" },
          to: { type: "string", description: "Target language code (e.g. 'en', 'ko', 'ja')" },
        },
        required: ["text", "from", "to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "shorten_url",
      description: "Shorten a long URL into a short, shareable link using is.gd",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to shorten" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "calculate",
      description:
        "Evaluate a math expression. Supports +, -, *, /, ^ (power), % (modulo), parentheses. Example: '(15 * 3) + 7.5'",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "Math expression to evaluate" },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "convert_currency",
      description:
        "Convert an amount between currencies using live exchange rates. Supports all major currencies (USD, KRW, EUR, JPY, GBP, CNY, etc.)",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount to convert" },
          from: { type: "string", description: "Source currency code (e.g. 'USD', 'KRW')" },
          to: { type: "string", description: "Target currency code (e.g. 'KRW', 'USD')" },
        },
        required: ["amount", "from", "to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_password",
      description: "Generate a strong random password with specified length",
      parameters: {
        type: "object",
        properties: {
          length: { type: "number", description: "Password length (default 16, max 64)" },
        },
        required: [],
      },
    },
  },
];
