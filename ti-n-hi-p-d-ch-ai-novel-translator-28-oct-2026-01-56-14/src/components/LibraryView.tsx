import React, { useState } from 'react';
import {
  Plus,
  Search,
  BookOpen,
  Sparkles,
  ChevronRight,
  Trash2,
  Globe,
  Clock,
  CheckCircle2,
  AlertTriangle,
  X,
  RotateCcw,
} from 'lucide-react';
import { Novel } from '../types/novel';
import { SAMPLE_NOVELS } from '../data/sampleNovels';
import { saveNovels } from '../services/storage';

interface LibraryViewProps {
  novels: Novel[];
  onSelectNovel: (novel: Novel) => void;
  onOpenReader: (novel: Novel, chapterIndex: number) => void;
  onOpenAddModal: () => void;
  onDeleteNovel: (novelId: string) => void;
  onRestoreSamples?: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  novels,
  onSelectNovel,
  onOpenReader,
  onOpenAddModal,
  onDeleteNovel,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'reading' | 'translated'>('all');
  const [novelToDelete, setNovelToDelete] = useState<Novel | null>(null);

  // Stats calculation
  const totalNovels = novels.length;
  const totalTranslatedChapters = novels.reduce(
    (acc, n) => acc + n.chapters.filter((c) => c.isTranslated).length,
    0
  );

  const filteredNovels = novels.filter((novel) => {
    const matchesSearch =
      novel.titleVi.toLowerCase().includes(searchQuery.toLowerCase()) ||
      novel.titleZh.toLowerCase().includes(searchQuery.toLowerCase()) ||
      novel.author.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterMode === 'reading') {
      return novel.lastReadChapterIndex > 1;
    }
    if (filterMode === 'translated') {
      return novel.chapters.some((c) => c.isTranslated);
    }
    return true;
  });

  const confirmDelete = () => {
    if (novelToDelete) {
      onDeleteNovel(novelToDelete.id);
      setNovelToDelete(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 sm:pb-16 animate-fade-in">
      {/* Mobile-optimized Header Banner */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-amber-950/40 bg-gradient-to-br from-neutral-950 via-neutral-900 to-amber-950/30 p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/20">
              <Sparkles className="h-3 w-3" />
              <span>Dịch Tiểu Thuyết Tiên Hiệp AI</span>
            </div>
            <h1 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-amber-50">
              Kệ Sách Của Bạn
            </h1>
            <p className="text-xs text-neutral-400 font-sans line-clamp-2">
              Dịch mượt mà văn phong tu tiên Việt Nam trực tiếp từ URL. Hỗ trợ đọc offline và nghe đọc giọng nói.
            </p>
          </div>

          {/* Quick stats on mobile */}
          <div className="flex items-center space-x-4 pt-1 sm:pt-0 border-t sm:border-t-0 border-neutral-800">
            <div className="flex items-center space-x-2">
              <span className="text-xs text-neutral-400">Bộ truyện:</span>
              <strong className="text-sm font-bold text-amber-300">{totalNovels}</strong>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-neutral-400">Đã dịch:</span>
              <strong className="text-sm font-bold text-emerald-400">{totalTranslatedChapters} chương</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên truyện hoặc tác giả..."
            className="w-full rounded-xl border border-neutral-800 bg-neutral-900/90 pl-10 pr-9 py-2.5 text-xs sm:text-sm text-neutral-200 placeholder-neutral-500 focus:border-amber-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center space-x-1 bg-neutral-900/80 p-1 rounded-xl border border-neutral-800 shrink-0">
          <button
            onClick={() => setFilterMode('all')}
            className={`flex-1 sm:flex-initial text-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              filterMode === 'all'
                ? 'bg-amber-600 text-white shadow'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Tất Cả ({novels.length})
          </button>
          <button
            onClick={() => setFilterMode('reading')}
            className={`flex-1 sm:flex-initial text-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              filterMode === 'reading'
                ? 'bg-amber-600 text-white shadow'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Đang Đọc
          </button>
          <button
            onClick={() => setFilterMode('translated')}
            className={`flex-1 sm:flex-initial text-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              filterMode === 'translated'
                ? 'bg-amber-600 text-white shadow'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Đã Dịch
          </button>
        </div>
      </div>

      {/* Novel Cards List / Grid */}
      {filteredNovels.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-800 py-12 px-4 text-center">
          <BookOpen className="h-10 w-10 text-neutral-600 mb-2.5" />
          <h3 className="text-sm font-semibold text-neutral-300">
            {novels.length === 0 ? 'Thư viện hiện đang trống' : 'Không tìm thấy truyện phù hợp'}
          </h3>
          <p className="mt-1 text-xs text-neutral-500 max-w-xs">
            {novels.length === 0
              ? 'Hãy thêm truyện mới bằng đường dẫn URL hoặc khôi phục truyện mẫu để trải nghiệm.'
              : 'Thử nhập từ khóa khác hoặc chuyển bộ lọc sang "Tất Cả".'}
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={onOpenAddModal}
              className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 shadow"
            >
              + Thêm Truyện Mới
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5">
          {filteredNovels.map((novel) => {
            const translatedCount = novel.chapters.filter((c) => c.isTranslated).length;
            const progressPercent = Math.round(
              (translatedCount / Math.max(1, novel.chapters.length)) * 100
            );

            return (
              <div
                key={novel.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-neutral-800/80 bg-neutral-900/70 hover:border-amber-900/80 hover:bg-neutral-900 transition-all shadow-md active:scale-[0.99]"
              >
                <div className="p-4 sm:p-5 space-y-3">
                  {/* Top: Cover + Info */}
                  <div className="flex space-x-3.5">
                    <div
                      onClick={() => onSelectNovel(novel)}
                      className="relative shrink-0 overflow-hidden rounded-xl bg-neutral-800 h-28 w-20 cursor-pointer shadow ring-1 ring-neutral-700/50"
                    >
                      {novel.coverUrl ? (
                        <img
                          src={novel.coverUrl}
                          alt={novel.titleVi}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-950/40 to-neutral-900 text-amber-400">
                          <BookOpen className="h-7 w-7" />
                        </div>
                      )}
                      <div className="absolute bottom-0 inset-x-0 bg-neutral-950/90 py-0.5 text-center text-[9px] font-mono font-semibold text-amber-300">
                        {novel.chapters.length} CHƯƠNG
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center space-x-1 text-[10px] text-neutral-400 font-mono truncate max-w-[130px]">
                          <Globe className="h-3 w-3 text-neutral-500 shrink-0" />
                          <span className="truncate">{novel.sourceDomain}</span>
                        </span>

                        {/* In-app Delete Trigger */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setNovelToDelete(novel);
                          }}
                          className="rounded-lg p-1.5 text-neutral-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                          title="Xóa truyện khỏi thư viện"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <h3
                        onClick={() => onSelectNovel(novel)}
                        className="mt-1 cursor-pointer font-serif text-sm sm:text-base font-bold text-amber-100 hover:text-amber-300 transition-colors line-clamp-1"
                      >
                        {novel.titleVi}
                      </h3>
                      <p className="text-[11px] text-neutral-400 font-serif line-clamp-1">
                        {novel.titleZh}
                      </p>
                      <p className="mt-1 text-[11px] text-neutral-400">
                        Tác giả: <span className="text-neutral-200">{novel.author}</span>
                      </p>

                      <div className="mt-2 flex items-center space-x-1.5 text-[10px] text-amber-400 font-medium">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>Đang đọc: Chương {novel.lastReadChapterIndex || 1}</span>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-neutral-400">
                      <span>Đã dịch {translatedCount}/{novel.chapters.length} chương</span>
                      <span className="font-semibold text-amber-400">{progressPercent}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                      <div
                        className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom Actions - Touch friendly */}
                <div className="flex items-center divide-x divide-neutral-800 border-t border-neutral-800/80 bg-neutral-950/50">
                  <button
                    onClick={() => onSelectNovel(novel)}
                    className="flex-1 py-3 text-center text-xs font-medium text-neutral-300 hover:bg-neutral-800/50 hover:text-white transition-colors"
                  >
                    Xem Mục Lục
                  </button>
                  <button
                    onClick={() => onOpenReader(novel, novel.lastReadChapterIndex || 1)}
                    className="flex-1 flex items-center justify-center space-x-1 py-3 text-center text-xs font-semibold text-amber-300 hover:bg-amber-950/40 hover:text-amber-200 transition-colors"
                  >
                    <span>Đọc Tiếp</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* In-App Delete Confirmation Modal (NO window.confirm) */}
      {novelToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 ring-1 ring-rose-500/20 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-sm text-neutral-100">Xác Nhận Xóa Truyện</h3>
                <p className="text-[11px] text-neutral-400">Hành động này không thể hoàn tác</p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Bạn có chắc chắn muốn xóa bộ truyện <strong className="text-amber-200">"{novelToDelete.titleVi}"</strong> cùng toàn bộ các chương đã dịch khỏi thiết bị?
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setNovelToDelete(null)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 shadow-md shadow-rose-950/50 transition-colors"
              >
                Xác Nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
