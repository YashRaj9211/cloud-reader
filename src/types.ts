export interface Book {
  id: string;
  name: string;
  size?: number;
  createdTime?: string;
  currentPage: number;
  totalPages: number;
  lastReadTime?: string;
}

export interface Highlight {
  id: string;
  page: number;
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  width: number; // percentage (0 - 100)
  height: number; // percentage (0 - 100)
  color: string; // Tailwind tint or hex
  text?: string; // OCR text snippet if available or custom label
  note?: string; // Text comments
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

export interface BookProgress {
  currentPage: number;
  totalPages: number;
  lastReadTime: string;
  highlights: Highlight[];
  notes: StickyNote[];
}

export interface SyncData {
  books: Record<string, BookProgress>;
}
