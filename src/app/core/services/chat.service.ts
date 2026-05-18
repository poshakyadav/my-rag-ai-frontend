import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ChatMessageRequest, ChatMessageResponse, StreamChunk } from '../models';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/chat`;

  /**
   * Blocking chat — waits for full response before returning.
   * Prefer streamMessage() for a responsive UI.
   */
  sendMessage(body: ChatMessageRequest): Observable<ChatMessageResponse> {
    return this.http.post<ChatMessageResponse>(`${this.base}/message`, body);
  }

  /**
   * Streaming chat via SSE.
   * Emits StreamChunk events: thinking → done | error.
   */
  streamMessage(body: ChatMessageRequest): Observable<StreamChunk> {
    const subject = new Subject<StreamChunk>();

    fetch(`${this.base}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          subject.error(new Error(`HTTP ${res.status}`));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            // Skip SSE comments (keep-alive pings start with ":")
            if (part.startsWith(':')) continue;
            const dataLine = part.split('\n').find((l) => l.startsWith('data:'));
            if (!dataLine) continue;
            const json = dataLine.slice(5).trim();
            if (!json) continue;
            try {
              const chunk: StreamChunk = JSON.parse(json);
              subject.next(chunk);
              if (chunk.type === 'done' || chunk.type === 'error') {
                subject.complete();
                return;
              }
            } catch {
              // skip
            }
          }
        }
        subject.complete();
      })
      .catch((err) => subject.error(err));

    return subject.asObservable();
  }

  /** Export full chat as a markdown plain-text download. */
  exportUrl(sessionId: string): string {
    return `${this.base}/export/${sessionId}`;
  }

  /**
   * Detect if a message contains one or more URLs.
   * Returns array of found URLs (empty if none).
   */
  extractUrls(message: string): string[] {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    return message.match(urlRegex) ?? [];
  }

  /**
   * Returns a short label for the thinking indicator based on message content.
   * Used by the UI to show contextual status (e.g. "Reading linked page…")
   */
  getThinkingLabel(message: string): string {
    const urls = this.extractUrls(message);
    if (urls.length > 0) {
      return `🔗 Reading linked page…`;
    }
    // Detect doc-fetching intent keywords
    const lower = message.toLowerCase();
    if (/latest|version|upgrade|migration|breaking|changelog/.test(lower)) {
      return '📚 Fetching latest docs…';
    }
    if (/how to|implement|write|create|build|generate/.test(lower)) {
      return '🔍 Researching best approach…';
    }
    return 'Thinking…';
  }
}
