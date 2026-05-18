import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, interval } from 'rxjs';

import { AppStateService } from '../../../core/services/app-state.service';
import { SessionService } from '../../../core/services/session.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { Session, SessionGroup } from '../../../core/models';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.scss'],
})
export class SidebarComponent implements OnInit, OnDestroy {
  private readonly sessionService = inject(SessionService);
  private readonly workspaceService = inject(WorkspaceService);
  readonly state = inject(AppStateService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  loading = true;
  groups: SessionGroup[] = [];
  filteredGroups: SessionGroup[] = [];
  searchQuery = '';

  // Context menu state
  menuSession: Session | null = null;
  menuX = 0;
  menuY = 0;

  // Rename state
  renameSession: Session | null = null;
  renameTitle = '';

  activeId = this.state.activeSessionId;

  ngOnInit(): void {
    this.loadSessions();

    // Refresh sidebar every 30 s to pick up title updates after messages
    interval(30_000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadSessions(false));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadSessions(showLoader = true): void {
    if (showLoader) this.loading = true;
    this.sessionService
      .listSessions()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.groups = res.groups;
          this.applySearch();
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  onSearchChange(): void {
    this.applySearch();
    this.cdr.markForCheck();
  }

  private applySearch(): void {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) {
      this.filteredGroups = this.groups;
      return;
    }
    this.filteredGroups = this.groups
      .map((g) => ({
        ...g,
        sessions: g.sessions.filter((s) => s.title.toLowerCase().includes(q)),
      }))
      .filter((g) => g.sessions.length > 0);
  }

  newChat(): void {
    // FIX (Issue 3): Before creating a new session, check if there's already
    // a blank session (message_count === 0). If so, navigate to it instead
    // of creating another empty one. This mirrors the ChatShellComponent logic.
    const allSessions = this.groups.flatMap((g) => g.sessions);
    const blankSession = allSessions.find((s) => s.message_count === 0);

    if (blankSession) {
      // Already have a pristine session — just navigate to it
      this.state.setActiveSession(blankSession);
      this.state.resetForNewSession();
      this.router.navigate(['/session', blankSession.session_id]);
      this.cdr.markForCheck();
      return;
    }

    // No blank session exists — create a fresh one
    this.sessionService.createSession().subscribe({
      next: (session) => {
        this.state.setActiveSession(session);
        this.state.resetForNewSession();
        this.router.navigate(['/session', session.session_id]);
        this.loadSessions(false);
      },
    });
  }

  loadSession(session: Session): void {
    this.closeMenus();

    // FIX (Issue 1): Update the active session in state BEFORE navigating.
    // This ensures that when the router emits the new params and ChatViewComponent
    // calls loadSession(), the state is already consistent — preventing the
    // stale-guard false-positive that was blocking the load.
    this.state.setActiveSession(session);
    this.state.resetForNewSession(); // Clear stale messages immediately so UI doesn't flicker with old content

    this.router.navigate(['/session', session.session_id]);
    this.cdr.markForCheck();
  }

  openWorkspace(): void {
    this.state.openWorkspacePanel();
  }

  // ── Context menu ────────────────────────────────────────────────────────────

  openMenu(event: MouseEvent, session: Session): void {
    event.stopPropagation();
    this.renameSession = null;
    this.menuSession = session;
    this.menuX = Math.min(event.clientX + 4, window.innerWidth - 170);
    this.menuY = Math.min(event.clientY, window.innerHeight - 100);
    this.cdr.markForCheck();
  }

  closeMenus(): void {
    this.menuSession = null;
    this.renameSession = null;
    this.cdr.markForCheck();
  }

  // ── Rename ──────────────────────────────────────────────────────────────────

  startRename(session: Session): void {
    this.renameTitle = session.title;
    this.renameSession = session;
    this.menuSession = null;
    this.cdr.markForCheck();
  }

  commitRename(): void {
    if (!this.renameSession || !this.renameTitle.trim()) return;
    this.sessionService
      .renameSession(this.renameSession.session_id, { title: this.renameTitle.trim() })
      .subscribe({
        next: () => {
          this.cancelRename();
          this.loadSessions(false);
        },
      });
  }

  cancelRename(): void {
    this.renameSession = null;
    this.renameTitle = '';
    this.cdr.markForCheck();
  }

  onRenameKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.commitRename();
    if (event.key === 'Escape') this.cancelRename();
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  deleteSession(session: Session): void {
    this.closeMenus();
    const isActive = session.session_id === this.state.activeSessionId();

    this.sessionService.deleteSession(session.session_id).subscribe({
      next: () => {
        if (isActive) {
          // FIX (Delete issue): After deleting the active session, reload the
          // session list and navigate to an existing session rather than always
          // creating a new one. Priority:
          //   1. Any existing blank (unused) session
          //   2. The most-recent session with messages
          //   3. Only if nothing exists at all — create a new session
          this.sessionService.listSessions().subscribe({
            next: (res) => {
              const remaining = res.groups.flatMap((g) => g.sessions);

              // Prefer a pre-existing blank session
              const blank = remaining.find((s) => s.message_count === 0);
              if (blank) {
                this.state.setActiveSession(blank);
                this.state.resetForNewSession();
                this.router.navigate(['/session', blank.session_id]);
                this.groups = res.groups;
                this.applySearch();
                this.cdr.markForCheck();
                return;
              }

              // Otherwise navigate to the most-recent session
              if (remaining.length > 0) {
                const mostRecent = remaining[0];
                this.state.setActiveSession(mostRecent);
                this.state.resetForNewSession();
                this.router.navigate(['/session', mostRecent.session_id]);
                this.groups = res.groups;
                this.applySearch();
                this.cdr.markForCheck();
                return;
              }

              // Nothing left — create a fresh session
              this.sessionService.createSession().subscribe({
                next: (newSession) => {
                  this.state.setActiveSession(newSession);
                  this.state.resetForNewSession();
                  this.router.navigate(['/session', newSession.session_id]);
                  this.loadSessions(false);
                },
              });
            },
            error: () => {
              // Fallback: create new session if list fails
              this.sessionService.createSession().subscribe({
                next: (newSession) => {
                  this.state.setActiveSession(newSession);
                  this.state.resetForNewSession();
                  this.router.navigate(['/session', newSession.session_id]);
                  this.loadSessions(false);
                },
              });
            },
          });
        } else {
          this.loadSessions(false);
        }
      },
    });
  }
}
