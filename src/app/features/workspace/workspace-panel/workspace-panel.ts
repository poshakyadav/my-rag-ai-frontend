import {
  Component, OnInit, OnDestroy, inject,
  ChangeDetectionStrategy, ChangeDetectorRef,
  signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

import { AppStateService } from '../../../core/services/app-state.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { SystemService } from '../../../core/services/system.service';
import {
  ValidationResult,
  IndexProgress,
  Workspace,
} from '../../../core/models';

type WorkspaceMode = 'none' | 'existing' | 'new';

interface StatusMessage {
  type: 'idle' | 'validating' | 'valid' | 'invalid' | 'indexing' | 'done' | 'error';
  text: string;
}

@Component({
  selector: 'app-workspace-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './workspace-panel.html',
  styleUrls: ['./workspace-panel.scss'],
})
export class WorkspacePanelComponent implements OnInit, OnDestroy {
  private readonly workspaceService = inject(WorkspaceService);
  private readonly systemService = inject(SystemService);
  readonly state = inject(AppStateService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  selectedMode: WorkspaceMode = 'existing';
  rawPaths = '';
  validation: ValidationResult | null = null;
  indexing = false;
  progressLabel = '';

  status: StatusMessage = { type: 'idle', text: '' };

  get currentBadge(): string {
    return this.state.workspaceBadge();
  }

  get pathPlaceholder(): string {
    if (this.selectedMode === 'new') {
      return 'Path for new project\ne.g. D:\\Projects\\MyNewApp\nor /home/user/projects/MyNewApp';
    }
    return 'Project path(s) — one per line\ne.g. D:\\Projects\\Backend\nD:\\Projects\\Frontend\n\nLabeled: backend: D:\\Projects\\Api';
  }

  get pathEntries(): { label: string; path: string }[] {
    if (!this.validation?.valid_paths) return [];
    return Object.entries(this.validation.valid_paths).map(([label, path]) => ({
      label,
      path,
    }));
  }

  ngOnInit(): void {
    // Sync mode from current workspace
    const ws = this.state.workspace();
    if (ws) {
      this.selectedMode = ws.mode;
      if (ws.paths) {
        this.rawPaths = Object.entries(ws.paths)
          .map(([label, path]) =>
            label === 'main' || label === Object.keys(ws.paths)[0]
              ? path
              : `${label}: ${path}`
          )
          .join('\n');
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  close(): void {
    this.state.closeWorkspacePanel();
  }

  setMode(mode: WorkspaceMode): void {
    this.selectedMode = mode;
    this.validation = null;
    this.status = { type: 'idle', text: '' };
    this.cdr.markForCheck();
  }

  onPathsChange(): void {
    // Clear validation state when user edits paths
    this.validation = null;
    this.status = { type: 'idle', text: '' };
  }

  validate(): void {
    const sessionId = this.state.activeSessionId();
    if (!sessionId) return;

    this.status = { type: 'validating', text: '🔍 Validating paths…' };
    this.validation = null;
    this.cdr.markForCheck();

    this.workspaceService
      .validatePaths(sessionId, { raw_paths: this.rawPaths, mode: this.selectedMode })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.validation = result;
          if (result.ok) {
            this.status = {
              type: 'valid',
              text: `✅ ${Object.keys(result.valid_paths).length} path(s) valid — click Apply & Index to continue.`,
            };
          } else {
            this.status = {
              type: 'invalid',
              text: `❌ ${result.errors.length} error(s) found. Please fix the paths above.`,
            };
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.status = { type: 'error', text: '❌ Validation request failed. Is the API running?' };
          this.cdr.markForCheck();
        },
      });
  }

  apply(): void {
    const sessionId = this.state.activeSessionId();
    if (!sessionId) return;

    this.indexing = true;
    this.status = { type: 'indexing', text: '⚡ Starting…' };
    this.progressLabel = 'Preparing…';
    this.validation = null;
    this.cdr.markForCheck();

    this.workspaceService
      .applyWorkspace(sessionId, { raw_paths: this.rawPaths, mode: this.selectedMode })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (progress: IndexProgress) => {
          this.progressLabel = progress.message;
          this.status = { type: 'indexing', text: progress.message };

          if (progress.stage === 'done') {
            this.indexing = false;
            this.status = { type: 'done', text: progress.message };

            // Refresh workspace in state
            this.workspaceService
              .getWorkspace(sessionId)
              .pipe(takeUntil(this.destroy$))
              .subscribe({
                next: (ws) => {
                  this.state.setWorkspace(ws);
                  this.cdr.markForCheck();
                },
              });

            // Auto-close after success
            setTimeout(() => this.close(), 1800);
          }

          if (progress.stage === 'error') {
            this.indexing = false;
            this.status = { type: 'error', text: `❌ ${progress.message}` };
          }

          this.cdr.markForCheck();
        },
        error: () => {
          this.indexing = false;
          this.status = { type: 'error', text: '❌ Connection failed. Is the API running?' };
          this.cdr.markForCheck();
        },
      });
  }

  clear(): void {
    const sessionId = this.state.activeSessionId();
    if (!sessionId) return;

    this.workspaceService
      .clearWorkspace(sessionId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (ws) => {
          this.state.setWorkspace(ws);
          this.rawPaths = '';
          this.validation = null;
          this.selectedMode = 'none';
          this.status = { type: 'idle', text: '' };
          this.cdr.markForCheck();
          setTimeout(() => this.close(), 600);
        },
      });
  }
}