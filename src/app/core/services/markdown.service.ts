import { Injectable } from '@angular/core';

/**
 * MarkdownService — zero-dependency inline renderer
 * ──────────────────────────────────────────────────
 * FIX: Added defensive type coercion in parseSync() / parse().
 *
 * Root cause of "TypeError: src.replace is not a function":
 *   LangGraph stores Gemini AI message content as a list of content blocks
 *   when tool calls are involved:
 *       [{"type": "text", "text": "..."}, {"type": "tool_use", ...}]
 *
 *   The backend's get_session_messages_for_display() was passing this array
 *   as the `content` string. Angular received it as a JS Array, which has no
 *   `.replace()` method, so renderMarkdown() crashed on line 1 of its first
 *   `.replace()` call.
 *
 *   The primary fix is in the Python backend (agent.py → _extract_text_content),
 *   but we add a guard here too so the frontend NEVER crashes regardless of
 *   what the backend sends.
 */
@Injectable({ providedIn: 'root' })
export class MarkdownService {
  /** Async wrapper — keeps the public API identical to the old service. */
  async parse(markdown: unknown): Promise<string> {
    return this.parseSync(markdown);
  }

  /** Synchronous markdown → HTML. */
  parseSync(src: unknown): string {
    // ── Safety guard ──────────────────────────────────────────────────────────
    // Guard against non-string input (arrays, objects, null, undefined, etc.)
    // that can arrive when the backend sends LangGraph's list-of-content-blocks
    // format instead of a plain string.
    const safeStr = _toSafeString(src);
    if (!safeStr) return '';
    return renderMarkdown(safeStr);
  }
}

/**
 * Coerce any value to a renderable string.
 *  - string   → returned as-is
 *  - Array    → extract "text" blocks, join with newline (mirrors backend logic)
 *  - null/undefined → ""
 *  - anything else  → String(value)
 */
function _toSafeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((block: unknown) => {
        if (typeof block === 'string') return block;
        if (block && typeof block === 'object') {
          const b = block as Record<string, unknown>;
          if (b['type'] === 'text' && typeof b['text'] === 'string') {
            return b['text'];
          }
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return String(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure-function renderer — no classes, no state, fully tree-shakeable
// ─────────────────────────────────────────────────────────────────────────────

function renderMarkdown(src: string): string {
  // Normalise line endings
  const lines = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ────────────────────────────────────────────────────
    const fenceMatch = line.match(/^(`{3,}|~{3,})([\w-]*)/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = fenceMatch[2] ? esc(fenceMatch[2]) : '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)) {
        codeLines.push(esc(lines[i]));
        i++;
      }
      i++; // consume closing fence
      const cls = lang ? ` class="language-${lang}"` : '';
      out.push(`<pre><code${cls}>${codeLines.join('\n')}</code></pre>`);
      continue;
    }

    // ── ATX heading ──────────────────────────────────────────────────────────
    const headMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headMatch) {
      const level = headMatch[1].length;
      out.push(`<h${level}>${inline(headMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // ── Horizontal rule ───────────────────────────────────────────────────────
    if (/^[-*_]{3,}\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // ── Blockquote ────────────────────────────────────────────────────────────
    if (line.startsWith('> ') || line === '>') {
      const bqLines: string[] = [];
      while (i < lines.length && (lines[i].startsWith('> ') || lines[i] === '>')) {
        bqLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${renderMarkdown(bqLines.join('\n'))}</blockquote>`);
      continue;
    }

    // ── Unordered list ────────────────────────────────────────────────────────
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^[-*+]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // ── Ordered list ──────────────────────────────────────────────────────────
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // ── Blank line ────────────────────────────────────────────────────────────
    if (line.trim() === '') {
      i++;
      continue;
    }

    // ── Paragraph ─────────────────────────────────────────────────────────────
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^(#{1,6}\s|[-*+]\s|\d+\.\s|> |`{3}|~{3}|[-*_]{3,}\s*$)/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      out.push(`<p>${inline(paraLines.join(' '))}</p>`);
    }
  }

  return out.join('\n');
}

/** Inline formatting: bold, italic, inline-code, links */
function inline(text: string): string {
  return (
    text
      .replace(/`([^`]+)`/g, (_m, c) => `<code>${esc(c)}</code>`)
      .replace(/\*\*\*(.+?)\*\*\*/g, (_m, t) => `<strong><em>${t}</em></strong>`)
      .replace(/\*\*(.+?)\*\*/g, (_m, t) => `<strong>${t}</strong>`)
      .replace(/__(.+?)__/g, (_m, t) => `<strong>${t}</strong>`)
      .replace(/\*(.+?)\*/g, (_m, t) => `<em>${t}</em>`)
      .replace(/_(.+?)_/g, (_m, t) => `<em>${t}</em>`)
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        (_m, label, href) => `<a href="${esc(href)}" target="_blank" rel="noopener">${label}</a>`
      )
  );
}

/** HTML-escape user-supplied text to prevent XSS */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}