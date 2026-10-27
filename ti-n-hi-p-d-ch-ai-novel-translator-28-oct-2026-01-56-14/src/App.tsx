import React, { useState, useEffect } from 'react';
import { Novel, ReaderSettings } from './types/novel';
import {
  getStoredNovels,
  saveNovels,
  getStoredSettings,
  saveStoredSettings,
  generateSQLiteExport,
} from './services/storage';
import { Navbar } from './components/Navbar';
import { LibraryView } from './components/LibraryView';
import { NovelDetailView } from './components/NovelDetailView';
import { ReaderView } from './components/ReaderView';
import { AddNovelModal } from './components/AddNovelModal';
import { translateChapterApi } from './services/api';
import { BookOpen, Plus, BookMarked, Download } from 'lucide-react';

export default function App() {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [settings, setSettings] = useState<ReaderSettings>(getStoredSettings());

  // Navigation states
  const [activeTab, setActiveTab] = useState<'library' | 'novel' | 'reader'>('library');
  const [activeNovelId, setActiveNovelId] = useState<string | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(1);

  // Add Novel Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Load stored novels on mount
  useEffect(() => {
    const loaded = getStoredNovels();
    setNovels(loaded);
  }, []);

  const handleUpdateNovel = (updatedNovel: Novel) => {
    const updatedNovels = novels.map((n) => (n.id === updatedNovel.id ? updatedNovel : n));
    setNovels(updatedNovels);
    saveNovels(updatedNovels);
  };

  const handleDeleteNovel = (novelId: string) => {
    const updated = novels.filter((n) => n.id !== novelId);
    setNovels(updated);
    saveNovels(updated);
    if (activeNovelId === novelId) {
      setActiveNovelId(null);
      setActiveTab('library');
    }
  };

  const handleNovelAdded = (newNovel: Novel) => {
    const updated = [newNovel, ...novels];
    setNovels(updated);
    saveNovels(updated);
    setActiveNovelId(newNovel.id);
    setActiveTab('novel');
  };

  const handleSelectNovel = (novel: Novel) => {
    setActiveNovelId(novel.id);
    setActiveTab('novel');
  };

  const handleOpenReader = (novel: Novel, chapterIndex: number) => {
    setActiveNovelId(novel.id);
    setActiveChapterIndex(chapterIndex);
    setActiveTab('reader');
  };

  const handleUpdateSettings = (newSettings: ReaderSettings) => {
    setSettings(newSettings);
    saveStoredSettings(newSettings);
  };

  const handleBatchTranslateNext = async (novel: Novel, count: number = 3) => {
    let untranslated = novel.chapters.filter((c) => !c.isTranslated);
    if (untranslated.length === 0) {
      alert('Tất cả các chương trong truyện đã được dịch!');
      return;
    }

    const toTranslate = untranslated.slice(0, count);
    for (const chap of toTranslate) {
      if (!chap.paragraphsZh || chap.paragraphsZh.length === 0) continue;
      try {
        const res = await translateChapterApi({
          chapterTitleZh: chap.titleZh,
          paragraphsZh: chap.paragraphsZh,
          memory: novel.memory,
          model: settings.aiModel,
        });

        if (res) {
          const currentNovel = novels.find((n) => n.id === novel.id) || novel;
          const updatedChapters = currentNovel.chapters.map((c) =>
            c.index === chap.index
              ? {
                  ...c,
                  titleVi: res.chapterTitleVi,
                  paragraphsVi: res.translatedParagraphs,
                  summary: res.summary,
                  qaReport: res.qaReport,
                  isTranslated: true,
                  translatedAt: new Date().toISOString(),
                }
              : c
          );
          handleUpdateNovel({ ...currentNovel, chapters: updatedChapters });
        }
      } catch (e: any) {
        console.error(`Batch translation error on chapter ${chap.index}:`, e);
      }
    }
  };

  const handleExportSqlite = () => {
    const sql = generateSQLiteExport(novels);
    const blob = new Blob([sql], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tien_hiep_dich_database_${new Date().toISOString().slice(0, 10)}.sql`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activeNovel = novels.find((n) => n.id === activeNovelId);

  // If in reader mode, render full reader screen
  if (activeTab === 'reader' && activeNovel) {
    return (
      <ReaderView
        novel={activeNovel}
        chapterIndex={activeChapterIndex}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onUpdateNovel={handleUpdateNovel}
        onCloseReader={() => setActiveTab('novel')}
        onNavigateChapter={(newIndex) => setActiveChapterIndex(newIndex)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans pb-16 sm:pb-0">
      {/* Top Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeNovelTitle={activeNovel?.titleVi}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onExportSqlite={handleExportSqlite}
      />

      {/* Main Content Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6">
        {activeTab === 'novel' && activeNovel ? (
          <NovelDetailView
            novel={activeNovel}
            onBack={() => setActiveTab('library')}
            onOpenReader={handleOpenReader}
            onUpdateNovel={handleUpdateNovel}
            onBatchTranslateNext={handleBatchTranslateNext}
            onDeleteNovel={handleDeleteNovel}
          />
        ) : (
          <LibraryView
            novels={novels}
            onSelectNovel={handleSelectNovel}
            onOpenReader={handleOpenReader}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onDeleteNovel={handleDeleteNovel}
          />
        )}
      </div>

      {/* Mobile Bottom Navigation Bar (Thumb Friendly) */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-neutral-950/95 border-t border-neutral-800/80 backdrop-blur-lg flex items-center justify-around py-2 px-2">
        <button
          onClick={() => setActiveTab('library')}
          className={`flex flex-col items-center space-y-0.5 p-1.5 transition-colors ${
            activeTab === 'library' ? 'text-amber-400 font-bold' : 'text-neutral-400'
          }`}
        >
          <BookOpen className="h-5 w-5" />
          <span className="text-[10px]">Thư Viện</span>
        </button>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex flex-col items-center space-y-0.5 p-1.5 text-amber-300"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-600 text-white shadow-md">
            <Plus className="h-4 w-4" />
          </div>
          <span className="text-[10px]">Thêm Link</span>
        </button>

        {activeNovel && (
          <button
            onClick={() => setActiveTab('novel')}
            className={`flex flex-col items-center space-y-0.5 p-1.5 transition-colors ${
              activeTab === 'novel' ? 'text-amber-400 font-bold' : 'text-neutral-400'
            }`}
          >
            <BookMarked className="h-5 w-5" />
            <span className="text-[10px]">Đang Xem</span>
          </button>
        )}

        <button
          onClick={handleExportSqlite}
          className="flex flex-col items-center space-y-0.5 p-1.5 text-neutral-400 hover:text-neutral-200"
        >
          <Download className="h-5 w-5" />
          <span className="text-[10px]">Sao Lưu</span>
        </button>
      </div>

      {/* Add Novel Modal */}
      <AddNovelModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onNovelAdded={handleNovelAdded}
      />
    </div>
  );
}
