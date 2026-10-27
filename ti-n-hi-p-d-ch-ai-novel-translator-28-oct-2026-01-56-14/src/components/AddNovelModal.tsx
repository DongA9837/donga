import React, { useState } from 'react';
import {
  X,
  Link,
  FileText,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { extractFromUrlApi, cleanRawTextApi } from '../services/api';
import { ExtractedPreview, Novel } from '../types/novel';

interface AddNovelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNovelAdded: (novel: Novel) => void;
}

export const AddNovelModal: React.FC<AddNovelModalProps> = ({
  isOpen,
  onClose,
  onNovelAdded,
}) => {
  const [activeTab, setActiveTab] = useState<'url' | 'raw'>('url');
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractedPreview, setExtractedPreview] = useState<ExtractedPreview | null>(null);

  // Manual raw text fields
  const [rawTitle, setRawTitle] = useState('');
  const [rawAuthor, setRawAuthor] = useState('');
  const [rawContent, setRawContent] = useState('');

  if (!isOpen) return null;

  const handleFetchUrl = async () => {
    let clean = (urlInput || '').trim();
    // Strip markdown formatting [label](url)
    const mdMatch = clean.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/i);
    if (mdMatch) {
      clean = mdMatch[1];
    }
    // Strip quotes and angle brackets
    clean = clean.replace(/^["'\[<`]+|["'\]>`]+$/g, '').trim();

    if (!clean) {
      setError('Vui lòng nhập đường dẫn URL tiểu thuyết tiếng Trung.');
      return;
    }

    // Auto-prepend https:// if omitted
    if (!/^https?:\/\//i.test(clean)) {
      clean = `https://${clean}`;
      setUrlInput(clean);
    }

    setIsLoading(true);
    setError(null);
    setExtractedPreview(null);

    try {
      const preview = await extractFromUrlApi(clean);
      setExtractedPreview(preview);
    } catch (err: any) {
      setError(
        err.message ||
          'Không thể trích xuất trang này. Nếu website có tường lửa bảo vệ, bạn có thể dùng thẻ "Nhập Trực Tiếp" để dán nội dung.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAddFromUrl = () => {
    if (!extractedPreview) return;

    const novelId = `novel-${Date.now()}`;
    const newNovel: Novel = {
      id: novelId,
      titleVi: extractedPreview.title,
      titleZh: extractedPreview.originalTitleZh || extractedPreview.title,
      author: extractedPreview.author || 'Khuyết danh',
      synopsis: extractedPreview.description || 'Chưa có tóm tắt.',
      coverUrl: extractedPreview.coverUrl,
      sourceUrl: extractedPreview.sourceUrl,
      sourceDomain: extractedPreview.sourceDomain,
      totalChapters: Math.max(1, extractedPreview.chapters.length),
      lastReadChapterIndex: 1,
      createdAt: new Date().toISOString(),
      memory: {
        characters: {},
        realms: {},
        sects: {},
        items: {},
        customGlossary: {},
        synopsis: extractedPreview.description,
      },
      chapters:
        extractedPreview.type === 'chapter' && extractedPreview.chapterCleanedParagraphs
          ? [
              {
                id: `chap-${novelId}-1`,
                novelId,
                index: 1,
                titleZh: extractedPreview.title,
                sourceUrl: extractedPreview.sourceUrl,
                paragraphsZh: extractedPreview.chapterCleanedParagraphs,
                isTranslated: false,
              },
            ]
          : extractedPreview.chapters.map((ch, idx) => ({
              id: `chap-${novelId}-${idx + 1}`,
              novelId,
              index: idx + 1,
              titleZh: ch.title,
              sourceUrl: ch.url,
              paragraphsZh: [],
              isTranslated: false,
            })),
    };

    onNovelAdded(newNovel);
    onClose();
  };

  const handleConfirmAddFromRaw = async () => {
    if (!rawTitle.trim() || !rawContent.trim()) {
      setError('Vui lòng nhập tiêu đề và nội dung chương tiếng Trung.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const cleaned = await cleanRawTextApi(rawTitle, rawContent);
      const novelId = `novel-raw-${Date.now()}`;

      const newNovel: Novel = {
        id: novelId,
        titleVi: rawTitle.trim(),
        titleZh: rawTitle.trim(),
        author: rawAuthor.trim() || 'Tác giả Trung Quốc',
        synopsis:
          cleaned.cleanedParagraphs.slice(0, 3).join(' ') ||
          'Chương truyện được nhập trực tiếp từ văn bản tiếng Trung.',
        sourceUrl: 'Nhập thủ công',
        sourceDomain: 'custom-text',
        totalChapters: 1,
        lastReadChapterIndex: 1,
        createdAt: new Date().toISOString(),
        memory: {
          characters: {},
          realms: {},
          sects: {},
          items: {},
          customGlossary: {},
        },
        chapters: [
          {
            id: `chap-${novelId}-1`,
            novelId,
            index: 1,
            titleZh: rawTitle.trim(),
            paragraphsZh: cleaned.cleanedParagraphs,
            isTranslated: false,
          },
        ],
      };

      onNovelAdded(newNovel);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi xử lý văn bản.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-amber-950/60 bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 p-5">
          <div className="flex items-center space-x-2">
            <Sparkles className="h-5 w-5 text-amber-400" />
            <h2 className="text-lg font-serif font-bold text-neutral-100">
              Thêm Truyện Hoặc Chương Mới
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-neutral-800 px-5 pt-3">
          <button
            onClick={() => {
              setActiveTab('url');
              setError(null);
            }}
            className={`flex items-center space-x-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === 'url'
                ? 'border-amber-500 text-amber-300'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Link className="h-4 w-4" />
            <span>Nhập Bằng URL Trang Web</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('raw');
              setError(null);
            }}
            className={`flex items-center space-x-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === 'raw'
                ? 'border-amber-500 text-amber-300'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Nhập Trực Tiếp (Văn Bản Tiếng Trung)</span>
          </button>
        </div>

        {/* Modal body */}
        <div className="p-5 space-y-4">
          {error && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-rose-900/50 bg-rose-950/30 p-3.5 text-sm text-rose-300">
              <div className="flex items-start space-x-2.5">
                <AlertCircle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-xs text-rose-200">Thông báo từ hệ thống:</p>
                  <p className="mt-0.5 text-xs text-rose-300/90 leading-relaxed">{error}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('raw');
                  setError(null);
                }}
                className="shrink-0 self-start sm:self-auto rounded-lg bg-rose-900/40 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-800/60 border border-rose-700/50 transition-colors"
              >
                Chuyển Sang Nhập Trực Tiếp
              </button>
            </div>
          )}

          {activeTab === 'url' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Đường dẫn (URL) trang tiểu thuyết hoặc chương truyện:
                </label>
                <div className="flex space-x-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/book/12345/ hoặc link truyện bất kỳ..."
                    className="flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    onClick={handleFetchUrl}
                    disabled={isLoading}
                    className="flex items-center space-x-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50 transition-colors shadow-md shadow-amber-900/20"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Đang tải...</span>
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4" />
                        <span>Phân Tích</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Sample quick test links */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  Hoặc chọn nhanh liên kết thử nghiệm chuẩn:
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUrlInput('https://example.com/book/12345/');
                      setError(null);
                    }}
                    className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 hover:border-amber-500/50 hover:text-amber-300 transition-colors"
                  >
                    Mẫu 1: https://example.com/book/12345/ (Bộ Truyện Mẫu)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUrlInput('https://example.com/chapter/1/');
                      setError(null);
                    }}
                    className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 hover:border-amber-500/50 hover:text-amber-300 transition-colors"
                  >
                    Mẫu 2: https://example.com/chapter/1/ (Chương Đơn Lẻ)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUrlInput('biquge.tv/book/34211/');
                      setError(null);
                    }}
                    className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 hover:border-amber-500/50 hover:text-amber-300 transition-colors"
                  >
                    Mẫu 3: biquge.tv/book/34211/ (Tự Động Thêm https://)
                  </button>
                </div>
              </div>

              {/* Loading steps feedback */}
              {isLoading && (
                <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 space-y-2">
                  <div className="flex items-center space-x-2 text-xs text-amber-300 font-medium">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Hệ thống đang thực hiện quy trình tự động:</span>
                  </div>
                  <ul className="text-[11px] text-neutral-400 space-y-1 pl-5 list-disc">
                    <li>Kiểm tra an toàn SSRF & định dạng URL</li>
                    <li>Tải mã nguồn & giải mã bảng mã (UTF-8, GBK, GB2312)</li>
                    <li>Nhận diện tên truyện, tác giả, mô tả và mục lục chương</li>
                    <li>Tự động bóc tách quảng cáo rác & ký hiệu website</li>
                  </ul>
                </div>
              )}

              {/* Extracted preview */}
              {extractedPreview && (
                <div className="rounded-xl border border-neutral-700 bg-neutral-950 p-4 space-y-3">
                  <div className="flex items-start space-x-3">
                    {extractedPreview.coverUrl ? (
                      <img
                        src={extractedPreview.coverUrl}
                        alt="Bìa"
                        className="h-20 w-16 rounded object-cover shadow"
                      />
                    ) : (
                      <div className="flex h-20 w-16 items-center justify-center rounded bg-neutral-800 text-neutral-500">
                        <BookOpen className="h-6 w-6" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="rounded bg-emerald-950/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-800/50">
                          {extractedPreview.type === 'chapter' ? 'Chương Đơn' : 'Toàn Bộ Tiểu Thuyết'}
                        </span>
                        <span className="text-[11px] text-neutral-400">
                          Nguồn: {extractedPreview.sourceDomain}
                        </span>
                      </div>
                      <h3 className="mt-1 font-serif text-base font-bold text-amber-100 truncate">
                        {extractedPreview.title}
                      </h3>
                      <p className="text-xs text-neutral-400">
                        Tác giả: <span className="text-neutral-200">{extractedPreview.author}</span>
                      </p>
                      <p className="mt-1 text-xs text-neutral-400 line-clamp-2">
                        {extractedPreview.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-neutral-800 pt-3 text-xs text-neutral-400">
                    <span>
                      Phát hiện:{' '}
                      <strong className="text-amber-300">
                        {extractedPreview.chapters.length} chương
                      </strong>
                    </span>
                    <button
                      onClick={handleConfirmAddFromUrl}
                      className="flex items-center space-x-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Xác Nhận Thêm Vào Thư Viện</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Tên truyện / Tiêu đề chương (Tiếng Trung hoặc Việt):
                  </label>
                  <input
                    type="text"
                    value={rawTitle}
                    onChange={(e) => setRawTitle(e.target.value)}
                    placeholder="VD: 凡人修仙传 / Chương 1..."
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Tác giả (nếu biết):
                  </label>
                  <input
                    type="text"
                    value={rawAuthor}
                    onChange={(e) => setRawAuthor(e.target.value)}
                    placeholder="VD: 忘语 (Vong Ngữ)"
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-neutral-300">
                    Nội dung văn bản tiếng Trung nguyên tác:
                  </label>
                  <span className="text-[11px] text-amber-400">
                    Hệ thống sẽ tự động lọc quảng cáo & tách đoạn
                  </span>
                </div>
                <textarea
                  rows={8}
                  value={rawContent}
                  onChange={(e) => setRawContent(e.target.value)}
                  placeholder="Dán nội dung tiếng Trung vào đây (ví dụ: 二愣子坐在村头的大青石上...)"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-950 p-3.5 text-xs text-neutral-100 placeholder-neutral-500 focus:border-amber-500 focus:outline-none font-sans"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleConfirmAddFromRaw}
                  disabled={isLoading}
                  className="flex items-center space-x-1.5 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50 transition-colors shadow-lg shadow-amber-900/30"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Xử Lý & Thêm Vào Thư Viện</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
