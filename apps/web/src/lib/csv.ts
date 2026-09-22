/**
 * Minimal RFC 4180 CSV/TSV reader.
 *
 * Deliberately dependency-free: picking an Excel library (SheetJS vs
 * exceljs) is still an open decision in docs/DECISIONS.md, and delimited
 * text covers the corpus exports we have today.
 */

export type ParsedTable = { headers: string[]; rows: string[][] };

/** Comma or tab, whichever appears more often outside quotes in line 1. */
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const counts: Array<[',' | ';' | '\t', number]> = [
    [',', (firstLine.match(/,/g) ?? []).length],
    [';', (firstLine.match(/;/g) ?? []).length],
    ['\t', (firstLine.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ',';
}

/** Parse delimited text, honouring quoted fields and embedded newlines. */
export function parseDelimited(text: string, delimiter?: string): ParsedTable {
  const sep = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Normalise line endings so CRLF files do not leak \r into values.
  const src = text.replace(/\r\n?/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }  // escaped quote
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === sep) { row.push(field); field = ''; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }

  // Flush whatever is still buffered when the file does not end in a newline.
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim().length > 0));
  const headers = (nonEmpty.shift() ?? []).map((h) => h.trim());
  return { headers, rows: nonEmpty };
}

/** Column letter for a zero-based index: 0 → A, 26 → AA. */
export function columnLetter(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Guess which columns hold the answer, the id and the question. */
export function guessMapping(headers: string[]): {
  answer: number; conversationId: number; question: number;
} {
  const find = (patterns: RegExp[]): number => {
    for (const p of patterns) {
      const i = headers.findIndex((h) => p.test(h.toLowerCase()));
      if (i !== -1) return i;
    }
    return -1;
  };
  return {
    answer: find([/respuesta/, /answer/, /output/, /completion/]),
    conversationId: find([/conversacion/, /conversation/, /^id$/, /_id$/]),
    question: find([/pregunta/, /question/, /prompt/, /input/]),
  };
}
