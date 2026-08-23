#!/usr/bin/env node
/**
 * Web i18n parity guard.
 *
 * `packages/web/src/lib/i18n.tsx` holds one flat table per locale. The module
 * already had a symmetry check, but it only `console.warn`s, only in dev — a
 * warning nobody reads while the build stays green. With two locales that was
 * survivable; the moment a third exists, silent drift is guaranteed, and a
 * missing key renders as the raw key string in the product.
 *
 * This is the CI teeth, deliberately generic over N locales: it discovers
 * every `const <locale>Translations` table in the file, so adding a language
 * needs no edit here.
 *
 * Parsing note: the tables are FLAT `Record<string, string>` literals, so
 * brace-matching the block and taking depth-1 quoted keys is exact. If the
 * shape ever nests, this script fails loudly rather than silently passing.
 */

import { readFileSync } from "node:fs";

const FILE = "packages/web/src/lib/i18n.tsx";
const TABLE_RE = /const\s+(\w+)Translations\s*:\s*Record<string,\s*string>\s*=\s*\{/g;

function fail(message) {
  console.error(`✗ i18n parity: ${message}`);
  process.exit(1);
}

const source = readFileSync(FILE, "utf8");

/** Slice the object literal that starts at `openIndex` (the `{`). */
function readObjectBody(text, openIndex) {
  let depth = 0;
  let inString = null;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1];
    if (inString) {
      if (ch === inString && prev !== "\\") inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(openIndex + 1, i);
    }
  }
  return null;
}

/** Top-level quoted keys of a flat table. Nested objects are a hard error. */
function tableKeys(body, locale) {
  const keys = [];
  let depth = 0;
  let inString = null;
  let pendingKey = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const prev = body[i - 1];
    if (inString) {
      if (ch === inString && prev !== "\\") {
        if (pendingKey !== null) {
          // Closing quote of a candidate key: keep it only if a colon follows.
          const rest = body.slice(i + 1).match(/^\s*:/);
          if (rest && depth === 0) keys.push(pendingKey);
          pendingKey = null;
        }
        inString = null;
      } else if (pendingKey !== null) {
        pendingKey += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      pendingKey = depth === 0 ? "" : null;
      continue;
    }
    if (ch === "`") {
      inString = ch;
      pendingKey = null;
      continue;
    }
    if (ch === "{") {
      depth++;
      if (depth === 1) fail(`${locale} table is no longer flat — this guard must be updated`);
    } else if (ch === "}") depth--;
  }
  return keys;
}

const tables = new Map();
let match = TABLE_RE.exec(source);
while (match) {
  const openIndex = source.indexOf("{", match.index + match[0].length - 1);
  const body = readObjectBody(source, openIndex);
  if (body === null) fail(`could not parse the ${match[1]} table`);
  tables.set(match[1], tableKeys(body, match[1]));
  match = TABLE_RE.exec(source);
}

if (tables.size < 2) {
  fail(`expected at least 2 locale tables in ${FILE}, found ${tables.size}`);
}

const [baseLocale, baseKeys] = [...tables][0];
const baseSet = new Set(baseKeys);

// Duplicate keys inside one table silently shadow each other — the later wins
// and the earlier translation is dead weight nobody notices.
for (const [locale, keys] of tables) {
  const seen = new Set();
  const dupes = keys.filter((k) => (seen.has(k) ? true : (seen.add(k), false)));
  if (dupes.length > 0) {
    fail(`${locale} has duplicate keys: ${[...new Set(dupes)].slice(0, 10).join(", ")}`);
  }
}

let problems = 0;
for (const [locale, keys] of [...tables].slice(1)) {
  const localeSet = new Set(keys);
  const missing = baseKeys.filter((k) => !localeSet.has(k));
  const extra = keys.filter((k) => !baseSet.has(k));
  if (missing.length > 0) {
    console.error(
      `✗ ${locale} is missing ${missing.length} key(s): ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? " …" : ""}`,
    );
    problems++;
  }
  if (extra.length > 0) {
    console.error(
      `✗ ${locale} has ${extra.length} key(s) ${baseLocale} lacks: ${extra.slice(0, 10).join(", ")}${extra.length > 10 ? " …" : ""}`,
    );
    problems++;
  }
}

if (problems > 0) {
  console.error("\nAdd the missing strings in the same commit — a key with no");
  console.error("translation renders as the raw key to the user.");
  process.exit(1);
}

console.log(
  `✓ i18n parity: ${tables.size} locales × ${baseKeys.length} keys (${[...tables.keys()].join(", ")})`,
);
