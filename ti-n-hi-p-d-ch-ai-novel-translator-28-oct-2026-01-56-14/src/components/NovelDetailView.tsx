import React, { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Play,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  Globe,
  Award,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { Novel, Chapter } from '../types/novel';

interface NovelDetailViewProps {
  novel: Novel;
  onBack: () => void;
  onOpenReader: (novel: Novel, chapterIndex: number) => void;
  onUpdateNovel: (updatedNovel: Novel) => void;
  onBatchTranslateNext: (novel: Novel, count: number) => void;
  onDeleteNovel: (novelId: string) => void;
}

export const NovelDetailView: React.FC<NovelDetailViewProps> = ({
  novel,
  onBack,
  onOpenReader,
  onUpdateNovel,
  onBatchTranslateNext,
  onDeleteNovel,
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const translatedChaptersCount = novel.chapters.filter((c) => c.isTranslated).length;

  const handleDelete = () => {
    onDeleteNovel(novel.id);
    setShowDeleteModal(false);
    onBack();
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in pb-20 sm:pb-16">
      {/* Top action row */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-1.5 text-xs font-semibold text-neutral-400 hover:text-amber-300 transition-colors p-1"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Về Thư Viện</span>
        </button>

        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          className="inline-flex items-center space-x-1 rounded-lg border border-neutral-800 bg-neutral-900/80 px-2.5 py-1.5 text-xs font-semibold text-neutral-400 hover:text-rose-400 hover:border-rose-900/50 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Xóa Truyện</span>
        </button>
      </div>

      {/* Novel Header Card - Mobile optimized */}
      <div className="overflow-hidden rounded-2xl sm:rounded-3xl border border-amber-950/40 bg-gradient-to-b from-neutral-900 to-neutral-950 p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
          {/* Cover */}
          <div className="relative shrink-0 overflow-hidden rounded-xl bg-neutral-800 h-44 w-32 sm:h-56 sm:w-40 shadow-lg ring-1 ring-amber-500/20 self-center sm:self-start">
            {novel.coverUrl ? (
              <img src={novel.coverUrl} alt={novel.titleVi} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-950 to-neutral-900 text-amber-300">
                <BookOpen className="h-10 w-10" />
              </div>
            )}
            <div className="absolute top-2 left-2 rounded-md bg-neutral-950/90 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-300">
              {novel.chapters.length} CHƯƠNG
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 space-y-2.5 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center space-x-1 rounded bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-300 font-mono">
                <Globe className="h-3 w-3 text-neutral-400 shrink-0" />
                <span className="truncate max-w-[140px]">{novel.sourceDomain}</span>
              </span>
              <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-500/20">
                Tiên Hiệp Dịch
              </span>
            </div>

            <h1 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-amber-100">
              {novel.titleVi}
            </h1>
            <p className="font-serif text-xs font-semibold text-neutral-400">
              Nguyên tác: <span className="text-amber-300 font-serif">{novel.titleZh}</span>
            </p>
            <p className="text-xs text-neutral-400">
              Tác giả: <strong className="text-neutral-200">{novel.author}</strong>
            </p>

            <p className="text-xs text-neutral-300 leading-relaxed line-clamp-3 font-sans">
              {novel.synopsis}
            </p>

            {/* Quick Actions */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <button
                onClick={() => onOpenReader(novel, novel.lastReadChapterIndex || 1)}
                className="flex items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 py-3 sm:py-2.5 px-5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-amber-900/40 hover:from-amber-500 hover:to-amber-600 transition-all ring-1 ring-amber-400/40 active:scale-95"
              >
                <Play className="h-4 w-4 fill-white shrink-0" />
                <span>Đọc Tiếp Chương {novel.lastReadChapterIndex || 1}</span>
              </button>

              <button
                onClick={() => onBatchTranslateNext(novel, 3)}
                className="flex items-center justify-center space-x-1.5 rounded-xl border border-neutral-700 bg-neutral-900/80 py-2.5 px-3.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 transition-colors"
              >
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                <span>Dịch Trước 3 Chương Tiếp</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Chapters Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-serif text-base font-bold text-neutral-100">
            Danh Sách Chương ({novel.chapters.length})
          </h2>
          <span className="text-xs text-neutral-400">
            Đã dịch: <strong className="text-amber-300">{translatedChaptersCount}</strong> / {novel.chapters.length}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {novel.chapters.map((ch) => (
            <div
              key={ch.id}
              onClick={() => onOpenReader(novel, ch.index)}
              className={`group flex items-center justify-between rounded-xl border p-3.5 transition-all cursor-pointer active:scale-[0.99] ${
                ch.isTranslated
                  ? 'border-neutral-800 bg-neutral-900/60 hover:border-amber-900/60 hover:bg-neutral-900'
                  : 'border-neutral-850 bg-neutral-950/40 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    ch.isTranslated
                      ? 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20'
                      : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {ch.index}
                </div>
                <div className="min-w-0">
                  <h4 className="font-serif text-xs sm:text-sm font-semibold text-neutral-200 group-hover:text-amber-300 transition-colors truncate">
                    {ch.titleVi || ch.titleZh}
                  </h4>
                  {ch.titleVi && (
                    <p className="text-[10px] text-neutral-500 truncate font-serif">
                      {ch.titleZh}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-1.5 shrink-0">
                {ch.isTranslated ? (
                  <span className="flex items-center space-x-1 rounded bg-emerald-950/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-800/40">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Đã dịch</span>
                  </span>
                ) : ch.isTranslating ? (
                  <span className="flex items-center space-x-1 rounded bg-amber-950/80 px-2 py-0.5 text-[10px] font-medium text-amber-400 animate-pulse">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span>Đang dịch</span>
                  </span>
                ) : (
                  <span className="rounded bg-neutral-800/80 px-2 py-0.5 text-[10px] font-medium text-neutral-400">
                    Chưa dịch
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* In-App Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 ring-1 ring-rose-500/20 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-sm text-neutral-100">Xóa Bộ Truyện Này?</h3>
                <p className="text-[11px] text-neutral-400">Không thể khôi phục sau khi xóa</p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Toàn bộ dữ liệu của bộ truyện <strong className="text-amber-200">"{novel.titleVi}"</strong> cùng các chương đã dịch sẽ được xóa khỏi thiết bị.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleDelete}
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
