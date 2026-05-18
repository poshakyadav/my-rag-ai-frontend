// chat-view.ts
import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewChecked,
  ViewChild,
  ElementRef,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { AppStateService } from '../../../core/services/app-state.service';
import { SessionService } from '../../../core/services/session.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ChatService } from '../../../core/services/chat.service';
import { Message } from '../../../core/models';
import { ChatInputComponent } from '../chat-input/chat-input';
import { MessageBubbleComponent } from '../message-bubble/message-bubble';

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  content: `## 👋 Welcome to Poshak-AI

I'm your personal coding assistant. Here's how to get started:

---

### 🗂️ Work on an existing project
Click the **📁 Workspace** button in the sidebar header to load your project path(s).

### 🔗 Paste any URL for instant reading
Drop any documentation link, GitHub file, or blog post URL in your message and I'll read the full page before answering.

### 🧠 Smart model routing
Use **⚡ Auto** mode to let me pick the right model for each query — fast models for quick Q&A, powerful models for writing full files or complex debugging.

### 💬 Just chat (no project)
No path needed — just start typing.

---

*Tip: I always fetch the latest official docs before writing code — no stale training data.*`,
};

@Component({
  selector: 'app-chat-view',
  standalone: true,
  imports: [CommonModule, ChatInputComponent, MessageBubbleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chat-view.html',
  styleUrls: ['./chat-view.scss'],
})
export class ChatViewComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef<HTMLElement>;

  readonly state = inject(AppStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly sessionService = inject(SessionService);
  private readonly workspaceService = inject(WorkspaceService);
  readonly chatService = inject(ChatService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private readonly destroy$ = new Subject<void>();

  readonly welcomeMessage = WELCOME_MESSAGE;

  thinkingLabel = 'Thinking…';

  private scrollPending = 0;

  get messages(): Message[] {
    return this.state.messages();
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const sessionId: string | undefined = params['id'];
      if (sessionId) {
        this.loadSession(sessionId);
      } else {
        const activeId = this.state.activeSessionId();
        if (activeId) {
          this.loadSession(activeId);
        }
      }
    });
  }

  ngAfterViewChecked(): void {
    if (this.scrollPending > 0) {
      this.scrollPending--;
      this.scrollToBottom();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onMessageSent(text: string): void {
    if (!text.trim() || this.state.isThinking()) return;
    const sessionId = this.state.activeSessionId();
    if (!sessionId) return;

    // Determine thinking label
    const selectedModel = this.state.selectedModel();
    if (selectedModel === 'auto') {
      this.thinkingLabel = this.chatService.getThinkingLabel(text);
    } else {
      const label = this.state.selectedModelLabel();
      this.thinkingLabel = `⚙️ Using ${label}…`;
    }

    this.state.appendMessage({ role: 'user', content: text });
    this.state.setThinking(true);
    this.state.appendMessage({ role: 'assistant', content: '' });
    this.requestScroll();
    this.cdr.markForCheck();

    this.chatService
      .streamMessage({
        message: text,
        session_id: sessionId,
        model: selectedModel === '' ? null : selectedModel,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (chunk) => {
          if (chunk.type === 'done') {
            this.state.updateLastAssistantMessage(chunk.content);
            this.state.setThinking(false);
            // Record which model was actually used
            if (chunk.model_used) {
              this.state.setLastModelUsed(chunk.model_used);
            }
            this.thinkingLabel = 'Thinking…';
            this.requestScroll();
            this.cdr.markForCheck();
          } else if (chunk.type === 'error') {
            this.state.updateLastAssistantMessage('⚠️ Error: ' + chunk.content);
            this.state.setThinking(false);
            this.thinkingLabel = 'Thinking…';
            this.requestScroll();
            this.cdr.markForCheck();
          }
        },
        error: () => {
          this.state.updateLastAssistantMessage('⚠️ Connection error. Please try again.');
          this.state.setThinking(false);
          this.thinkingLabel = 'Thinking…';
          this.requestScroll();
          this.cdr.markForCheck();
        },
      });
  }

  private loadSession(sessionId: string): void {
    this.state.resetForNewSession();
    this.cdr.markForCheck();

    this.sessionService
      .getSession(sessionId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (detail) => {
          this.state.setActiveSession(detail);
          this.state.setMessages(detail.messages);
          this.requestScroll();
          this.cdr.markForCheck();

          this.workspaceService
            .getWorkspace(sessionId)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (ws) => {
                this.state.setWorkspace(ws);
                this.cdr.markForCheck();
              },
            });
        },
        error: (err) => {
          console.error('Failed to load session:', err);
          this.cdr.markForCheck();
        },
      });
  }

  private requestScroll(cycles = 3): void {
    this.scrollPending = Math.max(this.scrollPending, cycles);
  }

  private scrollToBottom(): void {
    try {
      const el = this.messagesContainer?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    } catch {
      /* noop */
    }
  }
}
