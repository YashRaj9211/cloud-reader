export interface User {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

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
