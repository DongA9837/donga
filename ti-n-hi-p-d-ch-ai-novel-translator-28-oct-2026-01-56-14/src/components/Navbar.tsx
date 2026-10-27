import React from 'react';
import { BookOpen, BookMarked, Sparkles, Plus, Download } from 'lucide-react';

interface NavbarProps {
  activeTab: 'library' | 'novel' | 'reader';
  setActiveTab: (tab: 'library' | 'novel' | 'reader') => void;
  activeNovelTitle?: string;
  onOpenAddModal: () => void;
  onExportSqlite: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  activeNovelTitle,
  onOpenAddModal,
  onExportSqlite,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-amber-950/30 bg-neutral-950/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-3 sm:px-6">
        {/* Brand */}
        <div
          onClick={() => setActiveTab('library')}
          className="flex cursor-pointer items-center space-x-2.5 group"
        >
          <div className="relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-600 to-amber-900 shadow-md shadow-amber-900/40 ring-1 ring-amber-400/30 group-hover:ring-amber-400/60 transition-all shrink-0">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-amber-200" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-serif text-base sm:text-lg font-bold tracking-wide text-amber-100 group-hover:text-amber-300 transition-colors">
                TIÊN HIỆP DỊCH
              </span>
              <span className="rounded-full bg-amber-500/10 px-1.5 py-0.2 text-[9px] font-semibold text-amber-400 ring-1 ring-amber-500/20">
                AI NOVEL
              </span>
            </div>
            <p className="hidden sm:block text-[11px] text-neutral-400 font-sans">
              Dịch & Đọc Tiểu Thuyết Tiên Hiệp Trực Tiếp Từ URL
            </p>
          </div>
        </div>

        {/* Navigation for tablet/desktop */}
        <nav className="hidden sm:flex items-center space-x-1">
          <button
            onClick={() => setActiveTab('library')}
            className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'library'
                ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30'
                : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Thư Viện</span>
          </button>

          {activeNovelTitle && (
            <button
              onClick={() => setActiveTab('novel')}
              className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                activeTab === 'novel'
                  ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
              }`}
            >
              <BookMarked className="h-3.5 w-3.5" />
              <span className="max-w-[150px] truncate">{activeNovelTitle}</span>
            </button>
          )}
        </nav>

        {/* Right Actions: Clean, Mobile Friendly */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onExportSqlite}
            title="Lưu bản sao lưu SQLite offline"
            className="hidden md:flex items-center space-x-1 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-amber-400" />
            <span>Sao Lưu</span>
          </button>

          <button
            onClick={onOpenAddModal}
            className="flex items-center space-x-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-white shadow-md shadow-amber-950/50 hover:from-amber-500 hover:to-amber-600 transition-all ring-1 ring-amber-400/40 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span>Thêm Truyện</span>
          </button>
        </div>
      </div>
    </header>
  );
};
