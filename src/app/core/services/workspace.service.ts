import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Workspace,
  ValidationResult,
  ValidatePathsRequest,
  ApplyWorkspaceRequest,
  IndexProgress,
} from '../models';

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/workspace`;

  /** Get current workspace for a session. */
  getWorkspace(sessionId: string): Observable<Workspace> {
    return this.http.get<Workspace>(`${this.base}/${sessionId}`);
  }

  /** Validate raw path input — does NOT persist anything. */
  validatePaths(sessionId: string, body: ValidatePathsRequest): Observable<ValidationResult> {
    return this.http.post<ValidationResult>(`${this.base}/${sessionId}/validate`, body);
  }

  /**
   * Apply + Index the workspace.  Returns an Observable<IndexProgress> that
   * emits one event per SSE message and completes when the stream closes.
   */
  applyWorkspace(sessionId: string, body: ApplyWorkspaceRequest): Observable<IndexProgress> {
    const subject = new Subject<IndexProgress>();

    const url = `${this.base}/${sessionId}/apply`;
    fetch(url, {
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

          // Parse SSE: split on double-newline boundaries
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const dataLine = part.split('\n').find((l) => l.startsWith('data:'));
            if (!dataLine) continue;
            const json = dataLine.slice(5).trim();
            if (!json) continue;
            try {
              const event: IndexProgress = JSON.parse(json);
              subject.next(event);
              if (event.stage === 'done' || event.stage === 'error') {
                subject.complete();
                return;
              }
            } catch {
              // skip malformed lines
            }
          }
        }
        subject.complete();
      })
      .catch((err) => subject.error(err));

    return subject.asObservable();
  }

  /** Clear workspace → general chat mode. */
  clearWorkspace(sessionId: string): Observable<Workspace> {
    return this.http.delete<Workspace>(`${this.base}/${sessionId}`);
  }
}
