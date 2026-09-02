import React, { useState } from 'react';
import {
  Folder as FolderIcon,
  ChevronRight,
  ChevronDown,
  Plus,
  MoreVertical,
  Edit2,
  Trash2,
  FolderPlus,
  FileText,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { FolderResponse } from '../../types';
import { Button } from '../ui/Button';

export interface FolderTreeProps {
  onSelectFolder?: (folderId: string | null) => void;
}

export const FolderTree: React.FC<FolderTreeProps> = ({ onSelectFolder }) => {
  const {
    folders,
    activeFolderId,
    setActiveFolderId,
    createFolder,
    renameFolder,
    deleteFolder,
  } = useAppStore();

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [newFolderName, setNewFolderName] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editNameVal, setEditNameVal] = useState('');

  const toggleExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName.trim());
    setNewFolderName('');
    setShowCreateInput(false);
  };

  return (
    <div className="space-y-1 py-1">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-stone-500 font-semibold tracking-wider uppercase">
        <span>Directories</span>
        <button
          onClick={() => setShowCreateInput(!showCreateInput)}
          className="text-stone-400 hover:text-[#fa5d19] p-1 rounded transition-colors"
          title="New Folder"
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </button>
      </div>

      {showCreateInput && (
        <form onSubmit={handleCreate} className="px-3 py-1.5 flex items-center gap-1.5">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name..."
            className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-[#fa5d19]"
            autoFocus
          />
          <Button size="xs" type="submit">
            Add
          </Button>
          <Button
            size="xs"
            variant="ghost"
            type="button"
            onClick={() => setShowCreateInput(false)}
          >
            Cancel
          </Button>
        </form>
      )}

      {/* Root "All Documents" item */}
      <div
        onClick={() => {
          setActiveFolderId(null);
          onSelectFolder?.(null);
        }}
        className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
          activeFolderId === null
            ? 'bg-[#fa5d19]/10 text-[#fa5d19] font-semibold'
            : 'text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
        }`}
      >
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5" />
          <span>All Documents</span>
        </div>
      </div>

      {/* Folders List */}
      {folders.map((folder) => {
        const isSelected = activeFolderId === folder.id;
        const isEditing = editingFolderId === folder.id;

        return (
          <div key={folder.id} className="group">
            <div
              onClick={() => {
                setActiveFolderId(folder.id);
                onSelectFolder?.(folder.id);
              }}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-[#fa5d19]/10 text-[#fa5d19] font-semibold'
                  : 'text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FolderIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                {isEditing ? (
                  <input
                    type="text"
                    value={editNameVal}
                    onChange={(e) => setEditNameVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        renameFolder(folder.id, editNameVal);
                        setEditingFolderId(null);
                      }
                    }}
                    onBlur={() => {
                      if (editNameVal.trim()) {
                        renameFolder(folder.id, editNameVal);
                      }
                      setEditingFolderId(null);
                    }}
                    className="text-xs px-1.5 py-0.5 border border-[#fa5d19] rounded bg-white dark:bg-stone-950"
                    autoFocus
                  />
                ) : (
                  <span className="truncate">{folder.name}</span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {folder.book_count !== undefined && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300">
                    {folder.book_count}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingFolderId(folder.id);
                    setEditNameVal(folder.name);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-stone-600 p-0.5 transition-opacity"
                  title="Rename"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteFolder(folder.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-rose-500 p-0.5 transition-opacity"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
