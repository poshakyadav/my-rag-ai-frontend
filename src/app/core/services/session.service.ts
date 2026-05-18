import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Session,
  SessionListResponse,
  SessionDetail,
  Message,
  CreateSessionRequest,
  RenameSessionRequest,
} from '../models';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/sessions`;

  /** Return all sessions grouped by date. */
  listSessions(): Observable<SessionListResponse> {
    return this.http.get<SessionListResponse>(this.base);
  }

  /** Create a new session. */
  createSession(body: CreateSessionRequest = {}): Observable<Session> {
    return this.http.post<Session>(this.base, body);
  }

  /** Get full session detail including message history. */
  getSession(sessionId: string): Observable<SessionDetail> {
    return this.http.get<SessionDetail>(`${this.base}/${sessionId}`);
  }

  /** Get only the message list for a session. */
  getMessages(sessionId: string): Observable<Message[]> {
    return this.http.get<Message[]>(`${this.base}/${sessionId}/messages`);
  }

  /** Permanently delete a session. */
  deleteSession(sessionId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${sessionId}`);
  }

  /** Rename a session. */
  renameSession(sessionId: string, body: RenameSessionRequest): Observable<Session> {
    return this.http.patch<Session>(`${this.base}/${sessionId}/rename`, body);
  }
}
