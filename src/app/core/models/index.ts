// ── Session models ────────────────────────────────────────────────────────────

export interface ModelInfo {
  id: string;
  label: string;
  description: string;
  tier: 'fast' | 'balanced' | 'heavy' | 'auto';
  provider: 'google' | 'groq' | 'auto';
  available: boolean;
}

export interface ModelsResponse {
  models: ModelInfo[];
  default: string;
}

export interface Session {
  session_id: string;
  workspace: string;
  title: string;
  preview: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface SessionGroup {
  label: string; // "Today" | "Yesterday" | "This Week" | …
  sessions: Session[];
}

export interface SessionListResponse {
  groups: SessionGroup[];
  total: number;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionDetail extends Session {
  messages: Message[];
}

export interface CreateSessionRequest {
  workspace?: string;
}

export interface RenameSessionRequest {
  title: string;
}

// ── Workspace models ──────────────────────────────────────────────────────────

export interface Workspace {
  session_id: string;
  mode: 'none' | 'existing' | 'new';
  paths: Record<string, string>;
  label: string;
  indexed: boolean;
  collection_name: string;
  badge: string;
}

export interface ValidationResult {
  ok: boolean;
  valid_paths: Record<string, string>;
  errors: string[];
  warnings: string[];
  message: string;
}

export interface ValidatePathsRequest {
  raw_paths: string;
  mode: 'none' | 'existing' | 'new';
}

export interface ApplyWorkspaceRequest {
  raw_paths: string;
  mode: 'none' | 'existing' | 'new';
}

export interface IndexProgress {
  stage: 'validating' | 'scaffolded' | 'scanning' | 'indexing' | 'done' | 'error';
  message: string;
  badge?: string;
  chunks_done?: number;
  chunks_total?: number;
}

// ── Chat models ───────────────────────────────────────────────────────────────

export interface ChatMessageRequest {
  message: string;
  session_id: string;
  model?: string | null; // "auto" | specific model ID | null (use server default)
}

export interface ChatMessageResponse {
  session_id: string;
  role: string;
  content: string;
  is_first_message: boolean;
  model_used: string;
}

export interface StreamChunk {
  type: 'thinking' | 'done' | 'error';
  content: string;
  session_id: string;
  model_used: string;
}

// ── System models ─────────────────────────────────────────────────────────────

export interface SystemStatus {
  llm_model: string;
  db_chunks: number;
  session_count: number;
  timestamp: string;
  version: string;
}

export interface ExamplePromptsResponse {
  prompts: string[];
}
