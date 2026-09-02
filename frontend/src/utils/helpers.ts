// Utility functions for the Cloud PDF Reader application

/**
 * Generates a unique ID with the given prefix
 * @param prefix - The prefix for the ID
 * @returns A unique string ID
 */
export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Creates an empty book progress object
 * @param page - The initial page number (default: 1)
 * @returns An empty BookProgress object
 */
export function emptyProgress(page = 1): BookProgress {
  return {
    currentPage: page,
    totalPages: 1,
    lastReadTime: new Date().toISOString(),
    highlights: [],
    notes: [],
    inkStrokes: [],
    shapes: [],
    textBoxes: [],
  };
}

// Import the BookProgress type to avoid circular dependencies
import type { BookProgress } from '../types';