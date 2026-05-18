import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SystemStatus, ExamplePromptsResponse, ModelsResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class SystemService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/system`;

  status(): Observable<SystemStatus> {
    return this.http.get<SystemStatus>(`${this.base}/status`);
  }

  health(): Observable<{ status: string; timestamp: string }> {
    return this.http.get<{ status: string; timestamp: string }>(`${this.base}/health`);
  }

  examples(): Observable<ExamplePromptsResponse> {
    return this.http.get<ExamplePromptsResponse>(`${this.base}/examples`);
  }

  /** Fetch all available models and their availability status. */
  models(): Observable<ModelsResponse> {
    return this.http.get<ModelsResponse>(`${this.base}/models`);
  }
}
