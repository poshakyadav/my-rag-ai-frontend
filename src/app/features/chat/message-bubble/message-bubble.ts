import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  ViewEncapsulation,
  SecurityContext,
  inject,
  ElementRef,
  AfterViewChecked,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MarkdownService } from '../../../core/services/markdown.service';

// ── highlight.js loader (loaded once globally) ─────────────────────────────
// We load highlight.js from CDN on first use so it doesn't bloat the bundle.
let _hljs: any = null;
let _hljsLoading = false;
let _hljsCallbacks: Array<() => void> = [];

function _loadHighlightJs(onReady: () => void): void {
  if (_hljs) { onReady(); return; }

  _hljsCallbacks.push(onReady);
  if (_hljsLoading) return;
  _hljsLoading = true;

  // Inject CSS theme (GitHub Dark — matches our dark design)
  if (!document.querySelector('link[data-hljs-theme]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('data-hljs-theme', '1');
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
    document.head.appendChild(link);
  }

  // Inject JS
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js';
  script.onload = () => {
    _hljs = (window as any)['hljs'];
    if (_hljs) {
      _hljs.configure({ ignoreUnescapedHTML: true });
    }
    _hljsLoading = false;
    const cbs = _hljsCallbacks.slice();
    _hljsCallbacks = [];
    cbs.forEach(cb => cb());
  };
  script.onerror = () => {
    _hljsLoading = false;
    _hljsCallbacks = [];
  };
  document.head.appendChild(script);
}

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [CommonModule],
  // ViewEncapsulation.None is REQUIRED so that styles defined in this SCSS
  // also apply to DOM nodes injected at runtime (copy buttons, lang badges).
  // Angular's default Emulated mode adds _ngcontent-xxx attributes only to
  // template elements — dynamically-created nodes never get those attributes,
  // so scoped SCSS rules never match them.
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './message-bubble.html',
  styleUrls: ['./message-bubble.scss'],
})
export class MessageBubbleComponent implements OnChanges, AfterViewChecked {
  @Input({ required: true }) message!: { role: string; content: unknown };

  private readonly sanitizer = inject(DomSanitizer);
  private readonly markdownService = inject(MarkdownService);
  private readonly elRef = inject(ElementRef);
  private readonly ngZone = inject(NgZone);

  renderedHtml: SafeHtml = '';
  private _lastContent = '';
  private _needsPostProcess = false;

  get isUser(): boolean {
    return this.message.role === 'user';
  }

  get contentAsString(): string {
    return _coerceToString(this.message.content);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['message']) {
      const newContent = this.contentAsString;
      if (newContent !== this._lastContent) {
        this._lastContent = newContent;
        this._needsPostProcess = true;
        this.renderMarkdown();
      }
    }
  }

  ngAfterViewChecked(): void {
    if (this._needsPostProcess && !this.isUser) {
      const host: HTMLElement = this.elRef.nativeElement;
      const preBlocks = host.querySelectorAll<HTMLElement>('pre code');
      if (preBlocks.length) {
        this._needsPostProcess = false;
        this._applyHighlightingAndButtons();
      }
    }
  }

  private renderMarkdown(): void {
    if (this.isUser || !this.message.content) {
      this.renderedHtml = '';
      return;
    }
    const raw = this.markdownService.parseSync(this.contentAsString);
    // Sanitize first then bypass — this preserves language classes that
    // highlight.js needs while still preventing XSS from raw content.
    const safe = this.sanitizer.sanitize(SecurityContext.HTML, raw) ?? '';
    this.renderedHtml = this.sanitizer.bypassSecurityTrustHtml(safe);
  }

  /**
   * Run after innerHTML is set:
   * 1. Apply syntax highlighting via highlight.js (loaded lazily from CDN)
   * 2. Inject language badge + copy button into every <pre>
   *
   * Runs outside Angular's change detection zone — pure DOM manipulation.
   */
  private _applyHighlightingAndButtons(): void {
    this.ngZone.runOutsideAngular(() => {
      _loadHighlightJs(() => {
        const host: HTMLElement = this.elRef.nativeElement;
        const preBlocks = host.querySelectorAll<HTMLPreElement>('pre');

        preBlocks.forEach((pre) => {
          // Skip blocks already decorated
          if (pre.dataset['processed']) return;
          pre.dataset['processed'] = '1';

          const code = pre.querySelector('code');
          if (!code) return;

          // ── 1. Syntax highlighting ────────────────────────────────────────
          const langClass = Array.from(code.classList).find(c => c.startsWith('language-'));
          const lang = langClass ? langClass.replace('language-', '') : '';

          if (_hljs) {
            const plainText = code.textContent || '';
            try {
              if (lang && _hljs.getLanguage(lang)) {
                const result = _hljs.highlight(plainText, { language: lang });
                code.innerHTML = result.value;
              } else {
                const result = _hljs.highlightAuto(plainText);
                code.innerHTML = result.value;
                if (result.language && !lang) {
                  code.classList.add(`language-${result.language}`);
                }
              }
              code.classList.add('hljs');
            } catch {
              // If highlighting fails, leave the text as-is
            }
          }

          // ── 2. Wrap pre in relative container ────────────────────────────
          const parent = pre.parentElement!;
          if (!parent.classList.contains('code-block-wrapper')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            parent.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);
          }

          // ── 3. Language badge ─────────────────────────────────────────────
          const displayLang = lang
            || Array.from(code.classList).find(c => c.startsWith('language-'))?.replace('language-', '')
            || '';

          if (displayLang && !pre.querySelector('.code-lang-badge')) {
            const badge = document.createElement('span');
            badge.className = 'code-lang-badge';
            badge.textContent = displayLang;
            pre.appendChild(badge);
          }

          // ── 4. Copy button ────────────────────────────────────────────────
          if (!pre.querySelector('.code-copy-btn')) {
            const btn = document.createElement('button');
            btn.className = 'code-copy-btn';
            btn.title = 'Copy code';
            btn.type = 'button';
            btn.setAttribute('aria-label', 'Copy code');
            btn.innerHTML = _copyIconSvg();

            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              // Use the stored plain text, not highlighted HTML
              const plainText = code.textContent || '';
              navigator.clipboard.writeText(plainText).then(() => {
                btn.innerHTML = _checkIconSvg();
                btn.classList.add('code-copy-btn--copied');
                setTimeout(() => {
                  btn.innerHTML = _copyIconSvg();
                  btn.classList.remove('code-copy-btn--copied');
                }, 2000);
              }).catch(() => {
                // Fallback: select text for manual copy
                const range = document.createRange();
                range.selectNodeContents(code);
                window.getSelection()?.removeAllRanges();
                window.getSelection()?.addRange(range);
              });
            });

            pre.appendChild(btn);
          }
        });
      });
    });
  }
}

// ── SVG helpers ────────────────────────────────────────────────────────────

function _copyIconSvg(): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>`;
}

function _checkIconSvg(): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="#2ebc85" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`;
}

// ── Content coercion ────────────────────────────────────────────────────────

function _coerceToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((block: unknown) => {
        if (typeof block === 'string') return block;
        if (block && typeof block === 'object') {
          const b = block as Record<string, unknown>;
          if (b['type'] === 'text' && typeof b['text'] === 'string') return b['text'];
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return String(value);
}