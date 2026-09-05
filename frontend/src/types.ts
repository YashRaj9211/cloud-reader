// ── User & Auth ─────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

// ── Books & Annotations ──────────────────────────────────────────────────────
export interface Book {
  id: string;
  name: string;
  size?: number;
  createdTime?: string;
  currentPage: number;
  totalPages: number;
  lastReadTime?: string;
  directoryId?: string | null;
  status?: DocumentStatus;
}

export interface Highlight {
  id: string;
  page: number;
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  width: number; // percentage (0 - 100)
  height: number; // percentage (0 - 100)
  color: string;
  text?: string;
  note?: string;
  createdAt: string;
}

export interface StickyNote {
  id: string;
  page: number;
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  color: string;
  text: string;
  createdAt: string;
}

export interface InkPoint {
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
}

export interface InkStroke {
  id: string;
  page: number;
  points: InkPoint[];
  color: string;
  width: number;       // stroke width in px (visual, at zoom=1)
  opacity?: number;    // 0–1 (default 1.0; highlighter uses ~0.35)
  isHighlight?: boolean; // true → rendered as a thick translucent highlighter stroke
  createdAt: string;
}

export type ShapeKind = 'rect' | 'circle' | 'line' | 'arrow';

export interface ShapeAnnotation {
  id: string;
  page: number;
  kind: ShapeKind;
  x: number;      // percentage
  y: number;      // percentage
  width: number;  // percentage
  height: number; // percentage
  color: string;
  strokeWidth: number;
  createdAt: string;
}

export interface TextBox {
  id: string;
  page: number;
  x: number; // percentage
  y: number; // percentage
  text: string;
  color: string;
  fontSize: number;
  createdAt: string;
}

export interface BookProgress {
  currentPage: number;
  totalPages: number;
  lastReadTime: string;
  highlights: Highlight[];
  notes: StickyNote[];
  inkStrokes: InkStroke[];
  shapes: ShapeAnnotation[];
  textBoxes: TextBox[];
}

export interface SyncData {
  books: Record<string, BookProgress>;
}

// ── Global Notes ─────────────────────────────────────────────────────────────
export interface GlobalNoteItem {
  id: string;
  bookId: string;
  bookTitle: string;
  page: number;
  text: string;
  color: string;
  createdAt: string;
}

// ── Enums & Scopes ───────────────────────────────────────────────────────────
export type DocumentStatus = 
  | 'UPLOADED' 
  | 'PROCESSING' 
  | 'INDEXED' 
  | 'FAILED' 
  | 'NEEDS_REINDEX';

export type ScopeType = 'ALL' | 'FOLDER' | 'DOCUMENT' | 'CHAPTER';
export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM';
export type ViewMode = 'pdf' | 'markdown' | 'split';

// ── Indexing & Pipeline ──────────────────────────────────────────────────────
export interface DocumentProcessingResponse {
  id: string;
  document_id: string;
  status: DocumentStatus;
  total_pages: number;
  total_chunks: number;
  processed_chunks: number;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface DocumentMarkdownResponse {
  document_id: string;
  filename: string;
  markdown: string;
}

// ── Folders & Directories ────────────────────────────────────────────────────
export interface FolderResponse {
  id: string;
  name: string;
  parent_folder_id?: string | null;
  created_time?: string | null;
  modified_time?: string | null;
  book_count?: number;
}

export interface FolderDetailResponse extends FolderResponse {
  subdirectories: FolderResponse[];
  books: Book[];
}

export interface FolderCreatePayload {
  name: string;
  parent_folder_id?: string | null;
}

export interface FolderUpdatePayload {
  name?: string;
  parent_folder_id?: string | null;
}

// ── AI Chat & Scoped RAG ─────────────────────────────────────────────────────
export interface SourceCitation {
  document_id: string;
  document_name?: string | null;
  chapter_id?: string | null;
  chapter_title?: string | null;
  page_number: number;
  chunk_index: number;
  content: string;
  relevance_score?: number | null;
}

export interface GeneratedPdfPayload {
  title: string;
  filename: string;
  data: string; // Base64 encoded PDF bytes
  size_bytes: number;
  summary?: string;
}

export interface ChatMessageResponse {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  sources?: SourceCitation[];
  generated_pdf?: GeneratedPdfPayload;
}

export interface ChatSessionResponse {
  id: string;
  user_id: string;
  title: string;
  scope_type: ScopeType;
  scope_id?: string | null;
  created_at: string;
  updated_at?: string | null;
  messages?: ChatMessageResponse[];
}

export interface CreateSessionRequest {
  title?: string;
  scope_type: ScopeType;
  scope_id?: string | null;
}

export interface SendMessageResponse {
  session_id: string;
  user_message: ChatMessageResponse;
  assistant_message: ChatMessageResponse;
  sources: SourceCitation[];
}

export interface QueryScope {
  type: ScopeType;
  id?: string | null;
}

export interface QueryRequest {
  query: string;
  scope: QueryScope;
  n_results?: number;
}

export interface ChunkMetadataResponse {
  user_id: string;
  document_id: string;
  chapter_id?: string;
  page_number: number;
  chunk_index: number;
}

export interface QueryChunkResult {
  id: string;
  document: string;
  metadata: ChunkMetadataResponse;
  distance?: number | null;
}

export interface QueryResponse {
  query: string;
  scope: QueryScope;
  results: QueryChunkResult[];
}
