// chat-shell.ts

import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { Router } from '@angular/router';

import { AppStateService } from '../../../core/services/app-state.service';
import { SessionService } from '../../../core/services/session.service';
import { SystemService } from '../../../core/services/system.service';
import { SidebarComponent } from '../../sessions/sidebar/sidebar';
import { WorkspacePanelComponent } from '../../workspace/workspace-panel/workspace-panel';

@Component({
  selector: 'app-chat-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, WorkspacePanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chat-shell.html',
  styleUrls: ['./chat-shell.scss'],
})
export class ChatShellComponent implements OnInit {
  readonly state = inject(AppStateService);
  private readonly sessionService = inject(SessionService);
  private readonly systemService = inject(SystemService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    // Load available models once at app startup
    this.systemService.models().subscribe({
      next: (res) => this.state.setAvailableModels(res.models),
    });

    const currentUrl = this.router.url;
    const alreadyOnSession = currentUrl.startsWith('/session/');

    if (alreadyOnSession) {
      return;
    }

    if (this.state.activeSessionId()) {
      this.router.navigate(['/session', this.state.activeSessionId()], { replaceUrl: true });
      return;
    }

    this.sessionService.listSessions().subscribe({
      next: (res) => {
        const allSessions = res.groups.flatMap((g) => g.sessions);
        const blankSession = allSessions.find((s) => s.message_count === 0);

        if (blankSession) {
          this.state.setActiveSession(blankSession);
          this.router.navigate(['/session', blankSession.session_id], { replaceUrl: true });
        } else {
          this.sessionService.createSession().subscribe({
            next: (session) => {
              this.state.setActiveSession(session);
              this.router.navigate(['/session', session.session_id], { replaceUrl: true });
            },
          });
        }
      },
      error: () => {
        this.sessionService.createSession().subscribe({
          next: (session) => {
            this.state.setActiveSession(session);
            this.router.navigate(['/session', session.session_id], { replaceUrl: true });
          },
        });
      },
    });
  }
}
