import { useState } from 'react';
import { 
  Highlighter, 
  MessageSquare, 
  Search, 
  Trash2, 
  ExternalLink,
  Tag
} from 'lucide-react';
import { Highlight, StickyNote } from '../types';

interface AnnotationPanelProps {
  highlights: Highlight[];
  notes: StickyNote[];
  onPageSelect: (pageNumber: number) => void;
  onDeleteHighlight: (id: string) => void;
  onDeleteNote: (id: string) => void;
  darkMode: boolean;
}

type AnnotationFilter = 'all' | 'highlights' | 'notes';

export default function AnnotationPanel({
  highlights,
  notes,
  onPageSelect,
  onDeleteHighlight,
  onDeleteNote,
  darkMode,
}: AnnotationPanelProps) {
  const [filter, setFilter] = useState<AnnotationFilter>('all');
  const [search, setSearch] = useState('');

  // Normalize entries into a shared display layout structured by Page density
  const mergedAnnotations: Array<{
    id: string;
    type: 'highlight' | 'note';
    page: number;
    color: string;
    text: string;
    createdAt: string;
  }> = [];

  if (filter === 'all' || filter === 'highlights') {
    highlights.forEach((h) => {
      mergedAnnotations.push({
        id: h.id,
        type: 'highlight',
        page: h.page,
        color: h.color,
        text: h.text || `Highlight on page ${h.page}`,
        createdAt: h.createdAt,
      });
    });
  }

  if (filter === 'all' || filter === 'notes') {
    notes.forEach((n) => {
      mergedAnnotations.push({
        id: n.id,
        type: 'note',
        page: n.page,
        color: n.color,
        text: n.text,
        createdAt: n.createdAt,
      });
    });
  }

  // Sort annotations securely by Page first, then timestamp
  const sortedAnnotations = mergedAnnotations
    .filter((a) => a.text.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  return (
    <div className={`w-80 h-full flex flex-col border-l transition-colors duration-300 ${
      darkMode 
        ? 'bg-zinc-950 border-zinc-800 text-zinc-100' 
        : 'bg-white border-zinc-200 text-zinc-950'
    }`}>
      {/* Panel title */}
      <div className={`p-6 border-b flex items-center justify-between ${
        darkMode ? 'border-zinc-800' : 'border-zinc-100'
      }`}>
        <div className="flex items-center space-x-2">
          <Tag className="text-amber-500" size={18} />
          <h2 className="text-sm font-semibold tracking-tight font-sans">Annotations</h2>
        </div>
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-mono">
          {sortedAnnotations.length}
        </span>
      </div>

      {/* Filter Options */}
      <div className="p-4 space-y-3">
        {/* Toggle Button controls */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-transparent">
          {(['all', 'highlights', 'notes'] as AnnotationFilter[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`py-1.5 text-[10px] font-medium rounded-md capitalize transition-colors ${
                filter === tab
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-xs font-semibold'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Local Annotation queries search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-zinc-400" size={13} />
          <input
            type="text"
            placeholder="Search notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full pl-9 pr-4 py-1.5 text-[11px] rounded-lg border focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors ${
              darkMode 
                ? 'bg-zinc-900 border-zinc-800 text-zinc-100 placeholder-zinc-500' 
                : 'bg-white border-zinc-200 text-zinc-800 placeholder-zinc-400'
            }`}
          />
        </div>
      </div>

      {/* Display Annotation list cards */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5 custom-scrollbar">
        {sortedAnnotations.length === 0 ? (
          <div className="py-12 text-center flex flex-col items-center justify-center">
            <MessageSquare size={26} className="text-zinc-300 dark:text-zinc-700 mb-2" />
            <p className="text-xs text-zinc-400 font-sans">No annotations found</p>
            <p className="text-[10px] text-zinc-500 max-w-[180px] mt-1">
              {filter === 'all' 
                ? 'Highlight sections or enter notes on pages to start synchronizing.' 
                : `No matching ${filter} found.`}
            </p>
          </div>
        ) : (
          sortedAnnotations.map((item) => (
            <div
              key={item.id}
              onClick={() => onPageSelect(item.page)}
              className={`p-3 rounded-xl border relative text-left group cursor-pointer transition-all ${
                darkMode 
                  ? 'bg-zinc-900/60 hover:bg-zinc-900 border-zinc-800 hover:border-zinc-700' 
                  : 'bg-zinc-50/50 hover:bg-zinc-50 border-zinc-100 hover:border-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <div className="flex items-center space-x-1.5">
                  {item.type === 'highlight' ? (
                    <Highlighter size={12} className="text-amber-500" />
                  ) : (
                    <MessageSquare size={12} className="text-blue-500" />
                  )}
                  <span className="text-[10px] font-semibold text-zinc-400">
                    {item.type === 'highlight' ? 'HIGHLIGHT' : 'STICKY NOTE'}
                  </span>
                </div>
                
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600">
                  Page {item.page}
                </span>
              </div>

              {/* Text context snippet */}
              <p className="text-xs font-sans break-words text-zinc-700 dark:text-zinc-300 leading-relaxed pr-6 line-clamp-3">
                {item.text}
              </p>

              {/* Footer row metadata */}
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                <span className="text-[9px] font-mono text-zinc-400/80">
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                
                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPageSelect(item.page);
                    }}
                    className="p-1 rounded-sm text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
                    title="Jump to Page"
                  >
                    <ExternalLink size={11} />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const confirmed = window.confirm('Delete this annotation? This cannot be undone.');
                      if (confirmed) {
                        if (item.type === 'highlight') {
                          onDeleteHighlight(item.id);
                        } else {
                          onDeleteNote(item.id);
                        }
                      }
                    }}
                    className="p-1 rounded-sm text-zinc-400 hover:text-red-500"
                    title="Delete Annotation"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
