// app-state.service.ts — FULL REPLACEMENT
// Added: selectedModel signal, lastModelUsed signal, available models

import { Injectable, signal, computed } from '@angular/core';
import { Message, Session, Workspace, ModelInfo } from '../models';

/**
 * AppStateService
 * ───────────────
 * Single source of truth for all cross-component state using Angular signals.
 *
 * v4 additions:
 *   - selectedModel: the model the user has chosen in the dropdown
 *                    "auto" = smart routing, specific ID = forced model
 *   - lastModelUsed: populated after each response, shown in the UI badge
 *   - availableModels: loaded once at startup from GET /api/system/models
 */
@Injectable({ providedIn: 'root' })
export class AppStateService {
  // ── Active session ─────────────────────────────────────────────────────────
  readonly activeSessionId = signal<string | null>(null);
  readonly activeSession = signal<Session | null>(null);

  // ── Messages for the active session ───────────────────────────────────────
  readonly messages = signal<Message[]>([]);

  // ── Workspace for the active session ──────────────────────────────────────
  readonly workspace = signal<Workspace | null>(null);

  // ── Model selection ────────────────────────────────────────────────────────
  /**
   * The model selected by the user.
   * "auto" = let the server pick the best model per message.
   * A specific model ID = always use that model.
   * Persisted to localStorage so it survives page refresh.
   */
  readonly selectedModel = signal<string>(localStorage.getItem('poshak_selected_model') ?? 'auto');

  /** Model that was actually used for the most recent response. */
  readonly lastModelUsed = signal<string>('');

  /** List of available models loaded from the API. */
  readonly availableModels = signal<ModelInfo[]>([]);

  // ── UI state ───────────────────────────────────────────────────────────────
  readonly isThinking = signal(false);
  readonly sidebarOpen = signal(true);
  readonly workspacePanelOpen = signal(false);

  // ── Derived ────────────────────────────────────────────────────────────────
  readonly workspaceBadge = computed(() => this.workspace()?.badge ?? '💬 General chat');
  readonly isIndexed = computed(() => this.workspace()?.indexed ?? false);

  /** Human-readable label for the currently selected model. */
  readonly selectedModelLabel = computed(() => {
    const id = this.selectedModel();
    if (id === 'auto') return '⚡ Auto';
    const model = this.availableModels().find((m) => m.id === id);
    return model?.label ?? id;
  });

  /** Tier badge for the currently selected model (for the colour dot). */
  readonly selectedModelTier = computed(() => {
    const id = this.selectedModel();
    if (id === 'auto') return 'auto';
    const model = this.availableModels().find((m) => m.id === id);
    return model?.tier ?? 'fast';
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  setActiveSession(session: Session): void {
    this.activeSession.set(session);
    this.activeSessionId.set(session.session_id);
  }

  setMessages(messages: Message[]): void {
    this.messages.set(messages);
  }

  appendMessage(message: Message): void {
    this.messages.update((msgs) => [...msgs, message]);
  }

  updateLastAssistantMessage(content: string): void {
    this.messages.update((msgs) => {
      if (!msgs.length) return msgs;
      const last = msgs[msgs.length - 1];
      if (last.role === 'assistant') {
        return [...msgs.slice(0, -1), { ...last, content }];
      }
      return [...msgs, { role: 'assistant', content }];
    });
  }

  setWorkspace(workspace: Workspace | null): void {
    this.workspace.set(workspace);
  }

  setThinking(value: boolean): void {
    this.isThinking.set(value);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  openWorkspacePanel(): void {
    this.workspacePanelOpen.set(true);
  }

  closeWorkspacePanel(): void {
    this.workspacePanelOpen.set(false);
  }

  resetForNewSession(): void {
    this.messages.set([]);
    this.workspace.set(null);
    this.isThinking.set(false);
    this.lastModelUsed.set('');
  }

  // ── Model selection ────────────────────────────────────────────────────────

  setSelectedModel(modelId: string): void {
    this.selectedModel.set(modelId);
    localStorage.setItem('poshak_selected_model', modelId);
  }

  setLastModelUsed(modelId: string): void {
    this.lastModelUsed.set(modelId);
  }

  setAvailableModels(models: ModelInfo[]): void {
    this.availableModels.set(models);
  }
}
