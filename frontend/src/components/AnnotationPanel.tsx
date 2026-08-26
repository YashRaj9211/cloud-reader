import { useState } from 'react';
import {
  Highlighter,
  MessageSquare,
  Search,
  Trash2,
  ExternalLink,
  Tag,
  Pen,
  Square,
  Type,
  X,
} from 'lucide-react';
import { Highlight, StickyNote, InkStroke, ShapeAnnotation, TextBox } from '../types';

interface AnnotationPanelProps {
  highlights: Highlight[];
  notes: StickyNote[];
  inkStrokes: InkStroke[];
  shapes: ShapeAnnotation[];
  textBoxes: TextBox[];
  onPageSelect: (pageNumber: number) => void;
  onDeleteHighlight: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onDeleteInkStroke: (id: string) => void;
  onDeleteShape: (id: string) => void;
  onDeleteTextBox: (id: string) => void;
  darkMode: boolean;
  onClose?: () => void;
}

type AnnotationFilter = 'all' | 'highlights' | 'notes' | 'ink' | 'shapes' | 'text';

type MergedEntry = {
  id: string;
  type: 'highlight' | 'note' | 'ink' | 'shape' | 'text';
  page: number;
  color: string;
  text: string;
  createdAt: string;
};

export default function AnnotationPanel({
  highlights,
  notes,
  inkStrokes,
  shapes,
  textBoxes,
  onPageSelect,
  onDeleteHighlight,
  onDeleteNote,
  onDeleteInkStroke,
  onDeleteShape,
  onDeleteTextBox,
  darkMode,
  onClose,
}: AnnotationPanelProps) {
  const [filter, setFilter] = useState<AnnotationFilter>('all');
  const [search, setSearch] = useState('');

  const mergedAnnotations: MergedEntry[] = [];

  // Legacy rect highlights + freehand highlight ink strokes
  if (filter === 'all' || filter === 'highlights') {
    highlights.forEach((h) =>
      mergedAnnotations.push({
        id: h.id,
        type: 'highlight',
        page: h.page,
        color: h.color,
        text: h.text || `Highlight on page ${h.page}`,
        createdAt: h.createdAt,
      })
    );
    // Freehand highlighter strokes stored as InkStroke with isHighlight=true
    inkStrokes.filter((s) => s.isHighlight).forEach((s) =>
      mergedAnnotations.push({
        id: s.id,
        type: 'highlight',
        page: s.page,
        color: s.color,
        text: `Freehand highlight`,
        createdAt: s.createdAt,
      })
    );
  }

  if (filter === 'all' || filter === 'notes') {
    notes.forEach((n) =>
      mergedAnnotations.push({
        id: n.id,
        type: 'note',
        page: n.page,
        color: n.color,
        text: n.text,
        createdAt: n.createdAt,
      })
    );
  }

  // Only non-highlight ink strokes go in the 'ink' filter
  if (filter === 'all' || filter === 'ink') {
    inkStrokes.filter((s) => !s.isHighlight).forEach((s) =>
      mergedAnnotations.push({
        id: s.id,
        type: 'ink',
        page: s.page,
        color: s.color,
        text: `Pen stroke (${s.points.length} pts)`,
        createdAt: s.createdAt,
      })
    );
  }

  if (filter === 'all' || filter === 'shapes') {
    shapes.forEach((s) =>
      mergedAnnotations.push({
        id: s.id,
        type: 'shape',
        page: s.page,
        color: s.color,
        text: `${s.kind.charAt(0).toUpperCase() + s.kind.slice(1)} shape`,
        createdAt: s.createdAt,
      })
    );
  }

  if (filter === 'all' || filter === 'text') {
    textBoxes.forEach((t) =>
      mergedAnnotations.push({
        id: t.id,
        type: 'text',
        page: t.page,
        color: t.color,
        text: t.text,
        createdAt: t.createdAt,
      })
    );
  }

  const sorted = mergedAnnotations
    .filter((a) => a.text.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.page !== b.page ? a.page - b.page : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));

  const handleDelete = (item: MergedEntry) => {
    if (!window.confirm('Delete this annotation?')) return;
    if (item.type === 'highlight') {
      const isInkHL = inkStrokes.some((s) => s.id === item.id);
      if (isInkHL) onDeleteInkStroke(item.id);
      else onDeleteHighlight(item.id);
    } else if (item.type === 'note') onDeleteNote(item.id);
    else if (item.type === 'ink') onDeleteInkStroke(item.id);
    else if (item.type === 'shape') onDeleteShape(item.id);
    else if (item.type === 'text') onDeleteTextBox(item.id);
  };

  const typeIcon = (type: MergedEntry['type']) => {
    switch (type) {
      case 'highlight': return <Highlighter size={12} className="text-[#fa5d19]" />;
      case 'note': return <MessageSquare size={12} className="text-[#3b82f6]" />;
      case 'ink': return <Pen size={12} className="text-[#9061ff]" />;
      case 'shape': return <Square size={12} className="text-[#10b981]" />;
      case 'text': return <Type size={12} className="text-[#ec4899]" />;
    }
  };

  const typeLabel = (type: MergedEntry['type']) => {
    switch (type) {
      case 'highlight': return 'HIGHLIGHT';
      case 'note': return 'STICKY NOTE';
      case 'ink': return 'INK';
      case 'shape': return 'SHAPE';
      case 'text': return 'TEXT BOX';
    }
  };

  const filters: { id: AnnotationFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'highlights', label: 'HL' },
    { id: 'notes', label: 'Notes' },
    { id: 'ink', label: 'Ink' },
    { id: 'shapes', label: 'Shapes' },
    { id: 'text', label: 'Text' },
  ];

  return (
    <div className="w-full sm:w-80 md:w-72 h-full flex flex-col border-l border-[var(--color-outline-variant)] bg-[var(--color-surface)] text-[var(--color-on-surface)] transition-colors duration-300">
      {/* Header */}
      <div className="p-4 border-b border-[var(--color-outline-variant)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="text-[#fa5d19]" size={16} />
          <h2 className="text-sm font-semibold tracking-tight">Annotations</h2>
          <span className="badge-heat font-mono text-[10px] ml-1">
            {sorted.length}
          </span>
        </div>
        
        {onClose && (
          <button
            onClick={onClose}
            className="btn-secondary !h-8 !w-8 !p-0 md:hidden text-zinc-400 hover:text-[var(--color-on-surface)]"
            title="Close annotations"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="p-3 space-y-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {filters.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`chip-tag !py-0.5 !px-2.5 !text-[11px] shrink-0 ${filter === id ? 'active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 text-zinc-400" size={12} />
          <input
            type="text"
            placeholder="Search annotations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field w-full pl-8 pr-3 !py-1.5 text-xs"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 custom-scrollbar">
        {sorted.length === 0 ? (
          <div className="py-12 text-center flex flex-col items-center justify-center">
            <MessageSquare size={24} className="text-zinc-300 dark:text-zinc-700 mb-2" />
            <p className="text-xs text-zinc-400 font-medium">No annotations found</p>
            <p className="text-[10px] text-zinc-400 mt-1 max-w-[170px]">
              Use the toolbar tools to highlight, draw, or add notes.
            </p>
          </div>
        ) : (
          sorted.map((item) => (
            <div
              key={item.id}
              onClick={() => onPageSelect(item.page)}
              className="p-3 rounded-xl border border-[var(--color-outline-variant)] bg-[var(--color-surface-container-lowest)] hover:bg-[var(--color-surface-container-high)] relative text-left group cursor-pointer transition-all duration-150 shadow-xs"
            >
              {/* Color stripe */}
              <div
                className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full"
                style={{ backgroundColor: item.color }}
              />
              <div className="pl-1.5">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5">
                    {typeIcon(item.type)}
                    <span className="text-[9px] font-bold text-zinc-400 tracking-wide">
                      {typeLabel(item.type)}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-[#fa5d19]/10 text-[#fa5d19]">
                    P{item.page}
                  </span>
                </div>

                <p className="text-[11px] break-words text-[var(--color-on-surface)] leading-relaxed line-clamp-2">
                  {item.text}
                </p>

                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[var(--color-outline-variant)]/60">
                  <span className="text-[9px] font-mono text-zinc-400">
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); onPageSelect(item.page); }}
                      className="p-1 rounded text-zinc-400 hover:text-[var(--color-on-surface)]"
                      title="Jump to page"
                    >
                      <ExternalLink size={11} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                      className="p-1 rounded text-zinc-400 hover:text-red-500"
                      title="Delete"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
