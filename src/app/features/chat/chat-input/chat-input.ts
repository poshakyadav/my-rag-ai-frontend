import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SystemService } from '../../../core/services/system.service';
import { AppStateService } from '../../../core/services/app-state.service';
import { ChatService } from '../../../core/services/chat.service';
import { ModelInfo } from '../../../core/models';

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chat-input.html',
  styleUrls: ['./chat-input.scss'],
})
export class ChatInputComponent implements OnInit {
  @Input() disabled = false;
  @Output() messageSent = new EventEmitter<string>();
  @ViewChild('inputEl') inputEl!: ElementRef<HTMLTextAreaElement>;

  private readonly systemService = inject(SystemService);
  private readonly chatService = inject(ChatService);
  readonly state = inject(AppStateService);
  private readonly cdr = inject(ChangeDetectorRef);

  text = '';
  examples: string[] = [];
  examplesOpen = false;
  modelPickerOpen = false;

  get exportUrl(): string {
    const sid = this.state.activeSessionId();
    return sid ? this.chatService.exportUrl(sid) : '#';
  }

  get models(): ModelInfo[] {
    return this.state.availableModels();
  }

  get selectedModelId(): string {
    return this.state.selectedModel();
  }

  get selectedModelLabel(): string {
    return this.state.selectedModelLabel();
  }

  get selectedModelTier(): string {
    return this.state.selectedModelTier();
  }

  ngOnInit(): void {
    this.systemService.examples().subscribe({
      next: (res) => {
        this.examples = res.prompts;
        this.cdr.markForCheck();
      },
    });

    // Load available models if not already loaded
    if (this.state.availableModels().length === 0) {
      this.systemService.models().subscribe({
        next: (res) => {
          this.state.setAvailableModels(res.models);
          this.cdr.markForCheck();
        },
      });
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
    // Close model picker on Escape
    if (event.key === 'Escape') {
      this.modelPickerOpen = false;
      this.cdr.markForCheck();
    }
  }

  send(): void {
    const msg = this.text.trim();
    if (!msg || this.disabled) return;
    this.messageSent.emit(msg);
    this.text = '';
    this.modelPickerOpen = false;
    this.cdr.markForCheck();
  }

  useExample(ex: string): void {
    this.text = ex;
    this.examplesOpen = false;
    this.inputEl?.nativeElement?.focus();
    this.cdr.markForCheck();
  }

  selectModel(modelId: string): void {
    this.state.setSelectedModel(modelId);
    this.modelPickerOpen = false;
    this.cdr.markForCheck();
  }

  toggleModelPicker(): void {
    this.modelPickerOpen = !this.modelPickerOpen;
    this.examplesOpen = false;
    this.cdr.markForCheck();
  }

  getTierDot(tier: string): string {
    const dots: Record<string, string> = {
      auto: '⚡',
      fast: '🟢',
      balanced: '🟡',
      heavy: '🔴',
    };
    return dots[tier] ?? '⚪';
  }
}
