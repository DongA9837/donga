import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Settings,
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Sparkles,
  Award,
  Layers,
  BookOpen,
  Columns,
  X,
  Sliders,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Zap,
  Maximize2,
  Minimize2,
  HelpCircle,
  Edit3,
  Headphones,
  Info,
} from 'lucide-react';
import { Novel, Chapter, ReaderSettings, ReaderTheme, DualViewMode } from '../types/novel';
import { translateChapterApi, retranslateParagraphApi, extractFromUrlApi } from '../services/api';
import { pretranslator, PretranslateStatus } from '../services/pretranslator';
import {
  subscribeToSync,
  broadcastProgressUpdate,
  syncProgressWithServer,
  fetchServerProgress,
  getDeviceClientLabel,
} from '../services/sync';

// Helper to format clean, human-friendly names for device Vietnamese voices
export const getFriendlyVoiceName = (voice: SpeechSynthesisVoice): string => {
  const name = voice.name;
  const lower = name.toLowerCase();

  if (lower.includes('hoaimy') || lower.includes('hoài my')) {
    return 'Microsoft Hoài My (Nữ Tự Nhiên - Chuẩn)';
  }
  if (lower.includes('namminh') || lower.includes('nam minh')) {
    return 'Microsoft Nam Minh (Nam Trầm Chuẩn)';
  }
  if (lower.includes('linh')) {
    return 'Apple Linh (iOS / Mac - Miễn Phí)';
  }
  if (lower.includes('thu')) {
    return 'Apple Thu (iOS / Mac - Miễn Phí)';
  }
  if (lower.includes('samsung')) {
    return 'Samsung Tiếng Việt (Galaxy Miễn Phí)';
  }
  if (lower.includes('google') || lower.includes('network') || lower.includes('vic')) {
    if (lower.includes('male') || lower.includes('nam') || lower.includes('vid')) {
      return 'Google Tiếng Việt (Nam - Free)';
    }
    return 'Google Tiếng Việt (Nữ - Chuẩn Android/Chrome)';
  }
  if (lower.includes('an')) {
    return 'Microsoft An (Windows - Miễn Phí)';
  }
  const clean = name.replace(/vietnam|vietnamese|tiếng việt|tieng viet/gi, '').trim();
  return clean ? `${clean} (vi-VN)` : 'Giọng Tiếng Việt Thiết Bị';
};

interface ReaderViewProps {
  novel: Novel;
  chapterIndex: number;
  settings: ReaderSettings;
  onUpdateSettings: (settings: ReaderSettings) => void;
  onUpdateNovel: (updatedNovel: Novel) => void;
  onCloseReader: () => void;
  onNavigateChapter: (chapterIndex: number) => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  novel,
  chapterIndex,
  settings,
  onUpdateSettings,
  onUpdateNovel,
  onCloseReader,
  onNavigateChapter,
}) => {
  const currentChapter = novel.chapters.find((c) => c.index === chapterIndex);

  // States
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [translationError, setTranslationError] = useState<string | null>(null);

  // Fullscreen Reading Mode states
  const [isImmersiveMode, setIsImmersiveMode] = useState(false);
  const [showFullscreenToast, setShowFullscreenToast] = useState(false);
  const [fullscreenToastMessage, setFullscreenToastMessage] = useState('');

  // UI Panels
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [showChapterDrawer, setShowChapterDrawer] = useState(false);
  const [showVoiceHelpModal, setShowVoiceHelpModal] = useState(false);
  const [selectedParagraphIndex, setSelectedParagraphIndex] = useState<number | null>(null);

  // Retranslate single paragraph state
  const [retranslatePrompt, setRetranslatePrompt] = useState('');
  const [isRetranslating, setIsRetranslating] = useState(false);

  // TTS Voice States (Exclusively Vietnamese Voices)
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [currentTtsParagraph, setCurrentTtsParagraph] = useState<number>(0);
  const [ttsSpeed, setTtsSpeed] = useState<number>(settings.ttsSpeed || 1.0);
  const [ttsPitch, setTtsPitch] = useState<number>(1.0);
  const [vietnameseVoices, setVietnameseVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [voiceStyle, setVoiceStyle] = useState<string>('female-warm');

  // Refs for audio synchronization and clean stopping
  const ttsSpeedRef = useRef<number>(settings.ttsSpeed || 1.0);
  const ttsPitchRef = useRef<number>(1.0);
  const isManuallyStoppedRef = useRef<boolean>(false);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  const paragraphRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const wakeLockRef = useRef<any>(null);

  // Comprehensive Vietnamese Voice Filter & Loader with retry polling
  useEffect(() => {
    if ('speechSynthesis' in window) {
      const loadViVoices = () => {
        const allVoices = window.speechSynthesis.getVoices();
        // Strict filter: Match all Vietnamese language identifiers across Android, iOS, Windows, macOS, Chrome, Edge
        const viOnly = allVoices.filter((v) => {
          const lang = (v.lang || '').toLowerCase().replace(/_/g, '-');
          const name = (v.name || '').toLowerCase();
          return (
            lang.startsWith('vi') ||
            lang.includes('vi-vn') ||
            lang.includes('vie') ||
            name.includes('vietnam') ||
            name.includes('vietnamese') ||
            name.includes('tiếng việt') ||
            name.includes('tieng viet') ||
            name.includes('hoaimy') ||
            name.includes('namminh') ||
            name.includes('linh') ||
            name.includes('thu') ||
            (name.includes('an') && lang.includes('vi'))
          );
        });

        setVietnameseVoices(viOnly);

        if (viOnly.length > 0 && !selectedVoiceURI) {
          setSelectedVoiceURI(viOnly[0].voiceURI);
        }
      };

      loadViVoices();
      window.speechSynthesis.onvoiceschanged = loadViVoices;

      // Mobile Safari / Chrome Android async voice loading timers
      const t1 = setTimeout(loadViVoices, 150);
      const t2 = setTimeout(loadViVoices, 600);
      const t3 = setTimeout(loadViVoices, 1500);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, []);

  // Fullscreen persistence key
  const FS_STORAGE_KEY = 'tien_hiep_remember_fullscreen';

  // Double-tap tracking refs
  const lastTapTimeRef = useRef<number>(0);
  const lastTapPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Pre-translation status for next 5 chapters
  const [pretranslateStatus, setPretranslateStatus] = useState<PretranslateStatus>({
    isActive: false,
    isPaused: false,
    currentTranslatingIndex: null,
    targetChapterIndices: [],
    completedIndices: [],
    failedIndices: [],
    lastError: null,
  });

  // Restore fullscreen preference on mount
  useEffect(() => {
    try {
      const savedFsPref = localStorage.getItem(FS_STORAGE_KEY) === 'true';
      if (savedFsPref && !isImmersiveMode) {
        setIsImmersiveMode(true);
      }
    } catch {
      // Ignore
    }
  }, []);

  // Listen to device fullscreen changes (Standard + WebKit + Mozilla)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isDocFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      if (!isDocFs && isImmersiveMode) {
        setIsImmersiveMode(false);
        try {
          localStorage.setItem(FS_STORAGE_KEY, 'false');
        } catch {}
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
    };
  }, [isImmersiveMode]);

  // Fullscreen reading toggle with device synchronization and preference persistence
  const toggleFullscreen = async () => {
    const nextState = !isImmersiveMode;
    setIsImmersiveMode(nextState);

    try {
      localStorage.setItem(FS_STORAGE_KEY, nextState ? 'true' : 'false');
    } catch {}

    setFullscreenToastMessage(
      nextState
        ? '📖 Toàn Màn Hình Thiết Bị • Chạm 2 lần vào màn hình để bật/tắt • Đã nhớ thiết bị'
        : 'Đã thoát chế độ toàn màn hình'
    );
    setShowFullscreenToast(true);
    setTimeout(() => setShowFullscreenToast(false), 2600);

    try {
      const docEl = document.documentElement as any;
      if (nextState) {
        if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
          if (docEl.requestFullscreen) {
            await docEl.requestFullscreen().catch(() => {});
          } else if (docEl.webkitRequestFullscreen) {
            await docEl.webkitRequestFullscreen().catch(() => {});
          }
        }
      } else {
        if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
          if (document.exitFullscreen) {
            await document.exitFullscreen().catch(() => {});
          } else if ((document as any).webkitExitFullscreen) {
            await (document as any).webkitExitFullscreen().catch(() => {});
          }
        }
      }
    } catch {
      // Graceful fallback to CSS immersive view
    }
  };

  // Double-tap handler for Touch devices (Mobile: chạm 2 lần mới full màn hình)
  const handleTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;

    // Do NOT toggle if touching interactive controls, buttons, or dialogs
    if (
      target.closest(
        'button, select, input, a, [data-interactive="true"], .no-fs-toggle, [role="dialog"]'
      )
    ) {
      return;
    }

    // Do NOT toggle if user is selecting/highlighting text
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      return;
    }

    const touch = e.changedTouches[0];
    if (!touch) return;

    const now = Date.now();
    const timeDiff = now - lastTapTimeRef.current;
    const distX = Math.abs(touch.clientX - lastTapPosRef.current.x);
    const distY = Math.abs(touch.clientY - lastTapPosRef.current.y);

    if (timeDiff > 40 && timeDiff < 360 && distX < 35 && distY < 35) {
      // Double tap detected!
      toggleFullscreen();
      lastTapTimeRef.current = 0;
    } else {
      lastTapTimeRef.current = now;
      lastTapPosRef.current = { x: touch.clientX, y: touch.clientY };
    }
  };

  // Double click for Desktop
  const handleDoubleClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;

    if (
      target.closest(
        'button, select, input, a, [data-interactive="true"], .no-fs-toggle, [role="dialog"]'
      )
    ) {
      return;
    }

    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      return;
    }

    toggleFullscreen();
  };

  // Connect background pretranslator for next 5 chapters
  useEffect(() => {
    pretranslator.setCallback((updatedNovel) => {
      onUpdateNovel(updatedNovel);
    });

    const unsubscribe = pretranslator.subscribe((status) => {
      setPretranslateStatus(status);
    });

    // Start background pretranslation of the next 5 chapters
    pretranslator.updateQueue(novel, chapterIndex, settings.aiModel);

    return () => {
      unsubscribe();
    };
  }, [novel.id, chapterIndex, settings.aiModel]);

  // Cross-device & Web/App synchronization listener
  useEffect(() => {
    const unsubscribe = subscribeToSync((msg) => {
      if (msg.novelId === novel.id) {
        if (msg.chapter && msg.chapter.isTranslated) {
          const updatedChapters = novel.chapters.map((c) =>
            c.index === msg.chapter!.index ? msg.chapter! : c
          );
          onUpdateNovel({
            ...novel,
            chapters: updatedChapters,
            lastReadChapterIndex: msg.chapterIndex || novel.lastReadChapterIndex,
          });
        }
      }
    });

    // Check remote cloud sync state
    fetchServerProgress(novel.id).then((serverRec) => {
      if (serverRec && serverRec.chapters) {
        let hasNew = false;
        const merged = novel.chapters.map((c) => {
          const sChap = serverRec.chapters[c.index];
          if (sChap && sChap.isTranslated && !c.isTranslated) {
            hasNew = true;
            return {
              ...c,
              titleVi: sChap.titleVi || c.titleVi,
              paragraphsVi: sChap.paragraphsVi || c.paragraphsVi,
              summary: sChap.summary || c.summary,
              isTranslated: true,
              translatedAt: sChap.translatedAt || new Date().toISOString(),
            };
          }
          return c;
        });

        if (hasNew) {
          onUpdateNovel({ ...novel, chapters: merged });
        }
      }
    });

    return () => unsubscribe();
  }, [novel.id]);

  // Update reading position in novel and broadcast sync
  useEffect(() => {
    if (novel.lastReadChapterIndex !== chapterIndex) {
      const updated = {
        ...novel,
        lastReadChapterIndex: chapterIndex,
        lastReadAt: new Date().toISOString(),
      };
      onUpdateNovel(updated);
      broadcastProgressUpdate(novel.id, chapterIndex, currentChapter);
      syncProgressWithServer({
        novelId: novel.id,
        chapterIndex,
        chapterData: currentChapter,
      });
    }
  }, [chapterIndex]);

  // Keep screen awake if configured
  useEffect(() => {
    if (settings.keepScreenOn && 'wakeLock' in navigator) {
      navigator.wakeLock
        .request('screen')
        .then((lock) => {
          wakeLockRef.current = lock;
        })
        .catch((err) => console.log('Wake Lock error:', err));
    }
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, [settings.keepScreenOn]);

  // Auto translate chapter if not yet translated
  useEffect(() => {
    if (currentChapter && !currentChapter.isTranslated && !isTranslating) {
      handleTranslateCurrentChapter(settings.aiModel);
    }
  }, [currentChapter?.id]);

  // Background audio MediaSession setup for iOS & Android
  const setupMediaSession = () => {
    if ('mediaSession' in navigator && currentChapter) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentChapter.titleVi || currentChapter.titleZh,
        artist: novel.titleVi,
        album: 'Tiên Hiệp Dịch',
        artwork: [
          {
            src:
              novel.coverUrl ||
              'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=512',
            sizes: '512x512',
            type: 'image/jpeg',
          },
        ],
      });

      navigator.mediaSession.playbackState = 'playing';

      navigator.mediaSession.setActionHandler('play', () => toggleTts());
      navigator.mediaSession.setActionHandler('pause', () => stopTts());
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (currentTtsParagraph > 0) {
          playTtsParagraph(currentTtsParagraph - 1);
        }
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (currentTtsParagraph < (currentChapter.paragraphsVi?.length || 0) - 1) {
          playTtsParagraph(currentTtsParagraph + 1);
        }
      });
    }
  };

  // Translation handler with automatic URL content fetching if empty
  const handleTranslateCurrentChapter = async (chosenModel: string = settings.aiModel) => {
    if (!currentChapter) return;
    setIsTranslating(true);
    setTranslationError(null);
    setTranslationProgress(15);

    try {
      let paragraphsZh = currentChapter.paragraphsZh || [];

      // If chapter content is empty but has a URL, fetch content via rotating proxy first
      if (paragraphsZh.length === 0 && currentChapter.sourceUrl) {
        setTranslationProgress(20);
        console.log(`Đang tải văn bản tiếng Trung chương ${currentChapter.index} từ URL: ${currentChapter.sourceUrl}`);
        const extracted = await extractFromUrlApi(currentChapter.sourceUrl);
        if (extracted.chapterCleanedParagraphs && extracted.chapterCleanedParagraphs.length > 0) {
          paragraphsZh = extracted.chapterCleanedParagraphs;
        }
      }

      if (paragraphsZh.length === 0) {
        throw new Error('Chương này không có nội dung chữ Hán để dịch. Vui lòng kiểm tra lại đường link hoặc dán văn bản trực tiếp.');
      }

      const progressTimer = setInterval(() => {
        setTranslationProgress((prev) => (prev < 90 ? prev + 15 : prev));
      }, 400);

      const result = await translateChapterApi({
        chapterTitleZh: currentChapter.titleZh,
        paragraphsZh,
        memory: novel.memory,
        model: chosenModel,
      });

      clearInterval(progressTimer);
      setTranslationProgress(100);

      if (result) {
        const updatedChapter: Chapter = {
          ...currentChapter,
          titleVi: result.chapterTitleVi,
          paragraphsZh,
          paragraphsVi: result.translatedParagraphs,
          summary: result.summary,
          qaReport: result.qaReport,
          isTranslated: true,
          translatedAt: new Date().toISOString(),
        };

        const updatedChapters = novel.chapters.map((ch) =>
          ch.index === chapterIndex ? updatedChapter : ch
        );

        const updatedNovel = {
          ...novel,
          chapters: updatedChapters,
        };

        onUpdateNovel(updatedNovel);

        // Sync with web, app, and other open tabs
        broadcastProgressUpdate(novel.id, chapterIndex, updatedChapter);
        syncProgressWithServer({
          novelId: novel.id,
          chapterIndex,
          chapterData: updatedChapter,
        });
      }
    } catch (err: any) {
      setTranslationError(err.message || 'Lỗi khi dịch chương.');
    } finally {
      setIsTranslating(false);
    }
  };

  // Navigate to Next Chapter with immediate auto-translation
  const handleGoToNextChapter = () => {
    if (chapterIndex < novel.chapters.length) {
      stopTts();
      const nextIdx = chapterIndex + 1;
      onNavigateChapter(nextIdx);

      // Auto-translate next chapter immediately if not yet translated
      const nextChap = novel.chapters.find((c) => c.index === nextIdx);
      if (nextChap && (!nextChap.isTranslated || !nextChap.paragraphsVi || nextChap.paragraphsVi.length === 0)) {
        setTimeout(() => {
          handleTranslateCurrentChapter(settings.aiModel);
        }, 80);
      }
    }
  };

  // Navigate to Previous Chapter
  const handleGoToPrevChapter = () => {
    if (chapterIndex > 1) {
      stopTts();
      const prevIdx = chapterIndex - 1;
      onNavigateChapter(prevIdx);

      const prevChap = novel.chapters.find((c) => c.index === prevIdx);
      if (prevChap && (!prevChap.isTranslated || !prevChap.paragraphsVi || prevChap.paragraphsVi.length === 0)) {
        setTimeout(() => {
          handleTranslateCurrentChapter(settings.aiModel);
        }, 80);
      }
    }
  };

  // Re-translate single paragraph
  const handleRetranslateSingle = async () => {
    if (selectedParagraphIndex === null || !currentChapter) return;

    const originalZh = currentChapter.paragraphsZh[selectedParagraphIndex];
    const currentVi = currentChapter.paragraphsVi?.[selectedParagraphIndex] || '';

    setIsRetranslating(true);
    try {
      const newVi = await retranslateParagraphApi({
        originalZh,
        currentVi,
        userInstruction: retranslatePrompt || 'Dịch mượt mà, lưu loát đúng giọng tiên hiệp',
        glossaryContext: {
          ...novel.memory?.realms,
          ...novel.memory?.sects,
          ...novel.memory?.items,
          ...novel.memory?.customGlossary,
        },
      });

      const updatedParagraphsVi = [...(currentChapter.paragraphsVi || [])];
      updatedParagraphsVi[selectedParagraphIndex] = newVi;

      const updatedChapters = novel.chapters.map((ch) =>
        ch.index === chapterIndex ? { ...ch, paragraphsVi: updatedParagraphsVi } : ch
      );

      onUpdateNovel({ ...novel, chapters: updatedChapters });
      setSelectedParagraphIndex(null);
      setRetranslatePrompt('');
    } catch (err: any) {
      alert('Lỗi khi dịch lại đoạn: ' + err.message);
    } finally {
      setIsRetranslating(false);
    }
  };

  // Apply Vietnamese voice style presets
  const handleSelectVoiceStyle = (style: string) => {
    setVoiceStyle(style);
    let p = 1.0;
    let s = ttsSpeedRef.current;

    switch (style) {
      case 'female-warm': // Nữ truyền cảm
        p = 1.15;
        break;
      case 'male-deep': // Nam trầm ấm
        p = 0.82;
        s = Math.min(s, 0.95);
        break;
      case 'hero-epic': // Hào sảng kiếm hiệp
        p = 0.88;
        s = Math.max(1.1, s);
        break;
      case 'ancient-story': // Kể chuyện cổ trang
        p = 0.98;
        s = 0.92;
        break;
      case 'fast-flow': // Đọc lướt nhanh
        s = 1.35;
        p = 1.0;
        break;
      case 'night-calm': // Đêm khuya thư giãn
        p = 0.92;
        s = 0.85;
        break;
      case 'power-blade': // Kiếm khí hùng hồn
        p = 0.75;
        s = 1.05;
        break;
    }

    setTtsPitch(p);
    ttsPitchRef.current = p;
    setTtsSpeed(s);
    ttsSpeedRef.current = s;
    onUpdateSettings({ ...settings, ttsSpeed: s });

    if (isTtsPlaying) {
      isManuallyStoppedRef.current = true;
      window.speechSynthesis.cancel();
      setTimeout(() => {
        isManuallyStoppedRef.current = false;
        playTtsParagraph(currentTtsParagraph);
      }, 50);
    }
  };

  // Handle immediate speed change without lag
  const handleSpeedChange = (newSpeed: number) => {
    setTtsSpeed(newSpeed);
    ttsSpeedRef.current = newSpeed;
    onUpdateSettings({ ...settings, ttsSpeed: newSpeed });

    if (isTtsPlaying) {
      isManuallyStoppedRef.current = true;
      window.speechSynthesis.cancel();
      setTimeout(() => {
        isManuallyStoppedRef.current = false;
        playTtsParagraph(currentTtsParagraph);
      }, 50);
    }
  };

  // Clean Stop TTS (Fixes the mute/stop bug)
  const stopTts = () => {
    isManuallyStoppedRef.current = true;

    if ('speechSynthesis' in window) {
      // Unbind callbacks first to prevent onend from triggering next paragraph
      if (speechUtteranceRef.current) {
        speechUtteranceRef.current.onend = null;
        speechUtteranceRef.current.onerror = null;
      }
      window.speechSynthesis.cancel();
      speechUtteranceRef.current = null;
    }

    // Stop silent background audio
    if (silentAudioRef.current) {
      silentAudioRef.current.pause();
    }

    setIsTtsPlaying(false);

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  };

  // Play a paragraph with background audio keeper
  const playTtsParagraph = (index: number) => {
    if (!currentChapter?.paragraphsVi || index >= currentChapter.paragraphsVi.length) {
      stopTts();
      return;
    }

    isManuallyStoppedRef.current = false;
    setCurrentTtsParagraph(index);
    const textToRead = currentChapter.paragraphsVi[index];

    // Smooth scroll into view
    if (paragraphRefs.current[index]) {
      paragraphRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Keep background audio active on iOS & Android
    if (silentAudioRef.current) {
      silentAudioRef.current.play().catch(() => {});
    }

    setupMediaSession();

    if (!('speechSynthesis' in window)) {
      alert('Trình duyệt không hỗ trợ Web Speech API.');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'vi-VN';
    utterance.rate = ttsSpeedRef.current;
    utterance.pitch = ttsPitchRef.current;

    // Attach chosen Vietnamese voice if present
    if (selectedVoiceURI) {
      const match = vietnameseVoices.find((v) => v.voiceURI === selectedVoiceURI);
      if (match) utterance.voice = match;
    } else if (vietnameseVoices.length > 0) {
      utterance.voice = vietnameseVoices[0];
    }

    utterance.onend = () => {
      if (isManuallyStoppedRef.current) return;
      if (index + 1 < (currentChapter?.paragraphsVi?.length || 0)) {
        playTtsParagraph(index + 1);
      } else {
        if (chapterIndex < novel.chapters.length) {
          onNavigateChapter(chapterIndex + 1);
        } else {
          stopTts();
        }
      }
    };

    utterance.onerror = (e) => {
      if (isManuallyStoppedRef.current) return;
      console.log('TTS error event:', e);
      stopTts();
    };

    speechUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsTtsPlaying(true);
  };

  const toggleTts = () => {
    if (isTtsPlaying) {
      stopTts();
    } else {
      playTtsParagraph(currentTtsParagraph);
    }
  };

  // Theme styling
  const getThemeClasses = (theme: ReaderTheme) => {
    switch (theme) {
      case 'sepia': // Parchment
        return {
          wrapper: 'bg-[#f4ecd8] text-[#3c2a1e]',
          header: 'bg-[#ede3cc]/95 border-[#dfd4ba] text-[#3c2a1e]',
          highlight: 'bg-amber-300/40 ring-1 ring-amber-500/50 rounded-lg',
        };
      case 'dark': // OLED Dark
        return {
          wrapper: 'bg-neutral-950 text-neutral-200',
          header: 'bg-neutral-950/95 border-neutral-800 text-neutral-200',
          highlight: 'bg-amber-950/50 ring-1 ring-amber-500/50 rounded-lg',
        };
      case 'bamboo': // Trúc diệp
        return {
          wrapper: 'bg-[#eaf1ea] text-[#1b3422]',
          header: 'bg-[#e0ece0]/95 border-[#cfded0] text-[#1b3422]',
          highlight: 'bg-emerald-300/40 ring-1 ring-emerald-500/50 rounded-lg',
        };
      case 'midnight': // Mực đêm
        return {
          wrapper: 'bg-[#0f172a] text-[#e2e8f0]',
          header: 'bg-[#0f172a]/95 border-slate-800 text-[#e2e8f0]',
          highlight: 'bg-sky-950/60 ring-1 ring-sky-500/50 rounded-lg',
        };
      case 'light': // Trắng
      default:
        return {
          wrapper: 'bg-[#fafafa] text-[#1f2937]',
          header: 'bg-white/95 border-neutral-200 text-[#1f2937]',
          highlight: 'bg-amber-100 ring-1 ring-amber-400 rounded-lg',
        };
    }
  };

  const themeStyle = getThemeClasses(settings.theme);

  const getContentWidthClass = (width: 'compact' | 'normal' | 'wide') => {
    switch (width) {
      case 'compact':
        return 'max-w-xl';
      case 'wide':
        return 'max-w-4xl';
      case 'normal':
      default:
        return 'max-w-2xl';
    }
  };

  if (!currentChapter) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 text-neutral-200 p-4">
        <div className="text-center space-y-3">
          <p className="text-sm">Không tìm thấy nội dung chương {chapterIndex}.</p>
          <button
            onClick={onCloseReader}
            className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white"
          >
            Quay Lại
          </button>
        </div>
      </div>
    );
  }

  const paragraphsVi = currentChapter.paragraphsVi || [];
  const paragraphsZh = currentChapter.paragraphsZh || [];

  return (
    <div
      onDoubleClick={handleDoubleClick}
      onTouchEnd={handleTouchEnd}
      className={`min-h-screen transition-colors duration-200 select-text pb-28 ${
        isImmersiveMode ? 'fixed inset-0 z-50 overflow-y-auto' : ''
      } ${themeStyle.wrapper}`}
      style={{
        fontFamily:
          settings.fontFamily === 'font-serif'
            ? 'Merriweather, Georgia, serif'
            : settings.fontFamily === 'font-cinzel'
            ? 'Cinzel, serif'
            : '"Be Vietnam Pro", sans-serif',
      }}
    >
      {/* Silent Audio keeper for background playback on iOS & Android */}
      <audio
        ref={silentAudioRef}
        loop
        preload="auto"
        src="data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"
        className="hidden"
      />

      {/* Fullscreen Toast Notification */}
      {showFullscreenToast && (
        <div className="fixed top-4 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-50 rounded-full bg-neutral-900/95 border border-amber-500/40 px-4 py-2 text-xs font-semibold text-amber-200 shadow-2xl backdrop-blur-md flex items-center justify-center gap-2 pointer-events-none animate-in fade-in zoom-in-95">
          {isImmersiveMode ? (
            <Maximize2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          ) : (
            <Minimize2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          )}
          <span className="truncate">{fullscreenToastMessage}</span>
        </div>
      )}

      {/* Reader Mobile & Desktop Header - Smoothly hides in Immersive Mode */}
      <header
        className={`sticky top-0 z-30 flex h-13 sm:h-14 items-center justify-between px-3 sm:px-6 border-b backdrop-blur-md transition-all duration-300 ${
          isImmersiveMode ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
        } ${themeStyle.header}`}
      >
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              stopTts();
              onCloseReader();
            }}
            className="rounded-lg p-1.5 hover:bg-black/10 transition-colors shrink-0"
            title="Thoát chế độ đọc"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-xs font-bold truncate max-w-[130px] sm:max-w-xs">
              {novel.titleVi}
            </h2>
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] sm:text-[11px] opacity-75 truncate max-w-[140px] sm:max-w-[200px]">
                {currentChapter.titleVi || currentChapter.titleZh}
              </p>
              {/* Sync Status Badge */}
              <span
                className="hidden md:inline-flex items-center gap-1 text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono"
                title={`Đồng bộ tức thì: ${getDeviceClientLabel()} ⇄ Cloud`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Web ⇄ App</span>
              </span>
            </div>
          </div>
        </div>

        {/* Header Tools */}
        <div className="flex items-center space-x-1 sm:space-x-2">
          {/* Background 5-Chapter Pretranslation Status Pill */}
          {pretranslateStatus.targetChapterIndices.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                pretranslator.togglePause();
              }}
              className="flex items-center gap-1.5 text-[10px] sm:text-[11px] px-2 py-1 rounded-lg border transition-colors cursor-pointer bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
              title={
                pretranslateStatus.isPaused
                  ? 'Bấm để tiếp tục dịch trước 5 chương'
                  : 'Bấm để tạm dừng dịch trước 5 chương'
              }
            >
              {pretranslateStatus.currentTranslatingIndex ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-amber-500 shrink-0" />
                  <span className="hidden sm:inline">Dịch nền 5 ch.:</span>
                  <span className="font-semibold">
                    {pretranslateStatus.completedIndices.length}/{pretranslateStatus.targetChapterIndices.length}
                  </span>
                  <span className="hidden md:inline text-[9px] opacity-75">
                    (Ch.{pretranslateStatus.currentTranslatingIndex})
                  </span>
                </>
              ) : pretranslateStatus.completedIndices.length === pretranslateStatus.targetChapterIndices.length ? (
                <>
                  <Sparkles className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span className="hidden sm:inline text-emerald-600 dark:text-emerald-400 font-medium">
                    Sẵn sàng 5 chương tới ✓
                  </span>
                  <span className="sm:hidden text-emerald-600 dark:text-emerald-400 font-bold">5/5 ✓</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3 shrink-0" />
                  <span>
                    Dịch nền: {pretranslateStatus.completedIndices.length}/{pretranslateStatus.targetChapterIndices.length}
                  </span>
                </>
              )}
            </button>
          )}

          {/* Fullscreen Reading Toggle Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            title={isImmersiveMode ? 'Thoát toàn màn hình' : 'Toàn màn hình (Chạm 2 lần vào màn hình)'}
            className="flex items-center space-x-1 rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/20 hover:bg-amber-500/20 transition-colors"
          >
            {isImmersiveMode ? (
              <Minimize2 className="h-3 w-3" />
            ) : (
              <Maximize2 className="h-3 w-3" />
            )}
            <span className="hidden sm:inline">Toàn Màn Hình</span>
          </button>

          {/* AI Model Selector Button in Header */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSettingsDrawer(true);
            }}
            title="Chọn AI Dịch Thuật"
            className="flex items-center space-x-1 rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/20 hover:bg-amber-500/20 transition-colors"
          >
            <Sparkles className="h-3 w-3" />
            <span className="hidden sm:inline">
              {settings.aiModel === 'google-translate'
                ? 'Google Dịch'
                : settings.aiModel === 'gemini-3.8-flash'
                ? 'Gemini 3.8'
                : 'Gemini Lite'}
            </span>
          </button>

          {/* Dual View Toggle */}
          <div className="flex items-center rounded-lg bg-black/5 p-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateSettings({ ...settings, dualViewMode: 'vietnamese-only' });
              }}
              title="Chỉ đọc tiếng Việt"
              className={`rounded-md p-1.5 text-xs ${
                settings.dualViewMode === 'vietnamese-only'
                  ? 'bg-amber-600 text-white shadow'
                  : 'opacity-70 hover:opacity-100'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateSettings({ ...settings, dualViewMode: 'interleaved' });
              }}
              title="So sánh từng đoạn"
              className={`rounded-md p-1.5 text-xs ${
                settings.dualViewMode === 'interleaved'
                  ? 'bg-amber-600 text-white shadow'
                  : 'opacity-70 hover:opacity-100'
              }`}
            >
              <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateSettings({ ...settings, dualViewMode: 'parallel' });
              }}
              title="Song ngữ 2 cột"
              className={`hidden sm:block rounded-md p-1.5 text-xs ${
                settings.dualViewMode === 'parallel'
                  ? 'bg-amber-600 text-white shadow'
                  : 'opacity-70 hover:opacity-100'
              }`}
            >
              <Columns className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </div>

          {/* Re-translate button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleTranslateCurrentChapter(settings.aiModel);
            }}
            disabled={isTranslating}
            title="Dịch lại chương này"
            className="rounded-lg p-1.5 hover:bg-black/10 transition-colors opacity-80 hover:opacity-100 disabled:opacity-40"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${isTranslating ? 'animate-spin' : ''}`}
            />
          </button>

          {/* Chapter drawer toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowChapterDrawer(true);
            }}
            className="rounded-lg p-1.5 hover:bg-black/10 transition-colors"
            title="Mục lục chương"
          >
            <Sliders className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>

          {/* Reader Settings Drawer Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSettingsDrawer(true);
            }}
            className="rounded-lg p-1.5 hover:bg-black/10 transition-colors"
            title="Cài đặt"
          >
            <Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
        </div>
      </header>

      {/* Main Reading Content - Tapping center toggles Fullscreen Mode */}
      <main className="mx-auto px-3.5 sm:px-6 py-6 sm:py-10">
        <div className={`mx-auto ${getContentWidthClass(settings.contentWidth)}`}>
          {/* Chapter Title */}
          <div className="mb-6 text-center border-b pb-4 border-black/10">
            <span className="text-[10px] font-mono tracking-widest uppercase opacity-60">
              CHƯƠNG {currentChapter.index} / {novel.chapters.length}
            </span>
            <h1 className="mt-1.5 text-lg sm:text-2xl font-bold font-serif tracking-tight leading-snug">
              {currentChapter.titleVi || currentChapter.titleZh}
            </h1>
            {currentChapter.titleVi && (
              <p className="mt-1 text-[11px] opacity-60 font-serif">
                Nguyên tác: {currentChapter.titleZh}
              </p>
            )}
          </div>

          {/* Translation In-Progress */}
          {isTranslating && (
            <div className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-700 dark:text-amber-300">
                <span className="flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>
                    Đang dịch bằng{' '}
                    <strong>
                      {settings.aiModel === 'google-translate' ? 'Google Dịch' : 'Gemini AI'}
                    </strong>
                    ...
                  </span>
                </span>
                <span>{translationProgress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-950/20">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-300"
                  style={{ width: `${translationProgress}%` }}
                />
              </div>
            </div>
          )}

          {translationError && (
            <div className="mb-6 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-600 dark:text-rose-300 space-y-2">
              <p className="font-bold flex items-center space-x-1.5">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Không thể hoàn tất dịch:</span>
              </p>
              <p>{translationError}</p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleTranslateCurrentChapter('google-translate')}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white font-semibold hover:bg-emerald-500"
                >
                  Thử Google Dịch (Miễn Phí)
                </button>
                <button
                  onClick={() => handleTranslateCurrentChapter('gemini-3.1-flash-lite')}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-white font-semibold hover:bg-amber-500"
                >
                  Thử Gemini Lite
                </button>
              </div>
            </div>
          )}

          {/* Empty chapter prompt with AI selector */}
          {paragraphsVi.length === 0 && !isTranslating ? (
            <div className="text-center py-10 space-y-4 rounded-2xl border border-dashed border-black/15 p-6">
              <p className="text-xs sm:text-sm opacity-70">
                Chương này chưa có bản dịch tiếng Việt. Hãy chọn công cụ dịch:
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => {
                    onUpdateSettings({ ...settings, aiModel: 'google-translate' });
                    handleTranslateCurrentChapter('google-translate');
                  }}
                  className="flex items-center space-x-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow hover:bg-emerald-500 active:scale-95"
                >
                  <Zap className="h-4 w-4" />
                  <span>Dịch Bằng Google Dịch (Free & Nhanh)</span>
                </button>
                <button
                  onClick={() => {
                    onUpdateSettings({ ...settings, aiModel: 'gemini-3.1-flash-lite' });
                    handleTranslateCurrentChapter('gemini-3.1-flash-lite');
                  }}
                  className="flex items-center space-x-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white shadow hover:bg-amber-500 active:scale-95"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Dịch Bằng Gemini AI (Chuẩn Tiên Hiệp)</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-5">
              {/* MODE 1: Standard Vietnamese */}
              {settings.dualViewMode === 'vietnamese-only' && (
                <div className="space-y-4">
                  {paragraphsVi.map((paragraph, idx) => (
                    <div
                      key={idx}
                      ref={(el) => {
                        paragraphRefs.current[idx] = el;
                      }}
                      className={`group relative rounded-lg p-2 transition-all leading-relaxed ${
                        isTtsPlaying && currentTtsParagraph === idx
                          ? themeStyle.highlight
                          : 'hover:bg-black/5'
                      }`}
                      style={{
                        fontSize: `${settings.fontSize}px`,
                        lineHeight: settings.lineHeight,
                        marginBottom: `${(settings.paragraphSpacing - 1) * 1.1}rem`,
                      }}
                    >
                      <p>{paragraph}</p>
                      {/* Subtle paragraph actions on hover or focus without blocking center tap */}
                      <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity absolute right-2 -bottom-2.5 flex items-center gap-1 bg-neutral-900/90 text-white rounded-lg px-2 py-0.5 shadow text-[10px] z-10 backdrop-blur-xs no-fs-toggle">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            playTtsParagraph(idx);
                          }}
                          className="hover:text-amber-300 flex items-center gap-0.5 p-0.5"
                          title="Đọc từ đoạn này"
                        >
                          <Play className="h-2.5 w-2.5 fill-current" />
                          <span>Đọc</span>
                        </button>
                        <span className="opacity-30">|</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedParagraphIndex(idx);
                          }}
                          className="hover:text-amber-300 flex items-center gap-0.5 p-0.5"
                          title="Yêu cầu AI dịch lại đoạn này"
                        >
                          <Edit3 className="h-2.5 w-2.5" />
                          <span>Hiệu đính</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* MODE 2: Interleaved */}
              {settings.dualViewMode === 'interleaved' && (
                <div className="space-y-4">
                  {paragraphsVi.map((paragraph, idx) => (
                    <div
                      key={idx}
                      ref={(el) => {
                        paragraphRefs.current[idx] = el;
                      }}
                      className={`group relative rounded-xl p-3 border border-black/5 transition-all ${
                        isTtsPlaying && currentTtsParagraph === idx
                          ? themeStyle.highlight
                          : 'hover:bg-black/5'
                      }`}
                    >
                      {paragraphsZh[idx] && (
                        <p className="text-xs font-serif opacity-50 mb-1.5 select-all">
                          {paragraphsZh[idx]}
                        </p>
                      )}
                      <p
                        style={{
                          fontSize: `${settings.fontSize}px`,
                          lineHeight: settings.lineHeight,
                        }}
                        className="font-medium"
                      >
                        {paragraph}
                      </p>
                      <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity absolute right-2 -bottom-2.5 flex items-center gap-1 bg-neutral-900/90 text-white rounded-lg px-2 py-0.5 shadow text-[10px] z-10 backdrop-blur-xs no-fs-toggle">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            playTtsParagraph(idx);
                          }}
                          className="hover:text-amber-300 flex items-center gap-0.5 p-0.5"
                          title="Đọc từ đoạn này"
                        >
                          <Play className="h-2.5 w-2.5 fill-current" />
                          <span>Đọc</span>
                        </button>
                        <span className="opacity-30">|</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedParagraphIndex(idx);
                          }}
                          className="hover:text-amber-300 flex items-center gap-0.5 p-0.5"
                          title="Yêu cầu AI dịch lại đoạn này"
                        >
                          <Edit3 className="h-2.5 w-2.5" />
                          <span>Hiệu đính</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* MODE 3: Parallel Columns */}
              {settings.dualViewMode === 'parallel' && (
                <div className="space-y-3">
                  {paragraphsVi.map((paragraph, idx) => (
                    <div
                      key={idx}
                      ref={(el) => {
                        paragraphRefs.current[idx] = el;
                      }}
                      className={`group relative grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl p-3 border border-black/5 transition-all ${
                        isTtsPlaying && currentTtsParagraph === idx
                          ? themeStyle.highlight
                          : 'hover:bg-black/5'
                      }`}
                    >
                      <div className="text-xs font-serif opacity-60 leading-relaxed border-b md:border-b-0 md:border-r border-black/10 pb-2 md:pb-0 md:pr-3">
                        {paragraphsZh[idx] || '(Không có đoạn gốc)'}
                      </div>
                      <div
                        style={{
                          fontSize: `${settings.fontSize - 1}px`,
                          lineHeight: settings.lineHeight,
                        }}
                      >
                        {paragraph}
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity absolute right-2 -bottom-2.5 flex items-center gap-1 bg-neutral-900/90 text-white rounded-lg px-2 py-0.5 shadow text-[10px] z-10 backdrop-blur-xs no-fs-toggle">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            playTtsParagraph(idx);
                          }}
                          className="hover:text-amber-300 flex items-center gap-0.5 p-0.5"
                          title="Đọc từ đoạn này"
                        >
                          <Play className="h-2.5 w-2.5 fill-current" />
                          <span>Đọc</span>
                        </button>
                        <span className="opacity-30">|</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedParagraphIndex(idx);
                          }}
                          className="hover:text-amber-300 flex items-center gap-0.5 p-0.5"
                          title="Yêu cầu AI dịch lại đoạn này"
                        >
                          <Edit3 className="h-2.5 w-2.5" />
                          <span>Hiệu đính</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Chapter Navigation */}
          <div className="mt-10 flex items-center justify-between border-t border-black/10 pt-5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (chapterIndex > 1) {
                  stopTts();
                  onNavigateChapter(chapterIndex - 1);
                }
              }}
              disabled={chapterIndex <= 1}
              className="flex items-center space-x-1 rounded-xl border border-black/10 px-3.5 py-2 text-xs font-semibold disabled:opacity-30 hover:bg-black/5 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Chương Trước</span>
            </button>

            <span className="text-xs opacity-60 font-mono">
              {chapterIndex} / {novel.chapters.length}
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation();
                if (chapterIndex < novel.chapters.length) {
                  stopTts();
                  onNavigateChapter(chapterIndex + 1);
                }
              }}
              disabled={chapterIndex >= novel.chapters.length}
              className="flex items-center space-x-1 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-30 hover:bg-amber-500 shadow transition-colors"
            >
              <span>Chương Sau</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </main>

      {/* MINIMAL FLOATING CONTROLS IN FULLSCREEN IMMERSIVE MODE */}
      {isImmersiveMode && (
        <div
          data-interactive="true"
          onClick={(e) => e.stopPropagation()}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 bg-neutral-900/90 text-neutral-200 px-3 py-1.5 rounded-full shadow-2xl border border-neutral-700/60 backdrop-blur-md text-xs transition-all hover:bg-neutral-900"
        >
          {isTtsPlaying && (
            <span className="flex items-center gap-1.5 text-amber-300 pr-1">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[11px] font-mono">Đoạn {currentTtsParagraph + 1}/{paragraphsVi.length}</span>
            </span>
          )}
          <button
            type="button"
            onClick={toggleTts}
            className="p-1 rounded-full hover:bg-neutral-800 text-amber-400"
            title={isTtsPlaying ? 'Tạm dừng đọc' : 'Tiếp tục đọc'}
          >
            {isTtsPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex items-center gap-1 pl-1.5 border-l border-neutral-700 hover:text-white"
            title="Thoát toàn màn hình (hoặc chạm giữa màn hình)"
          >
            <Minimize2 className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[10px] hidden sm:inline">Thoát toàn màn hình</span>
          </button>
        </div>
      )}

      {/* Floating Vietnamese Text-To-Speech (TTS) Dock - Mobile & Desktop with Background Audio */}
      {!isImmersiveMode && (
        <div
          data-interactive="true"
          onClick={(e) => e.stopPropagation()}
          className="fixed bottom-3 inset-x-3 sm:inset-x-auto sm:right-6 sm:w-[420px] z-40 rounded-2xl border border-amber-950/40 bg-neutral-900/95 text-neutral-100 p-3 shadow-2xl backdrop-blur-md transition-all"
        >
          <div className="space-y-2.5">
            {/* Main Controls Row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                {/* Skip back */}
                <button
                  type="button"
                  onClick={() => {
                    if (currentTtsParagraph > 0) {
                      playTtsParagraph(currentTtsParagraph - 1);
                    }
                  }}
                  className="p-1.5 text-neutral-400 hover:text-white transition-colors shrink-0"
                  title="Đoạn trước"
                >
                  <SkipBack className="h-4 w-4" />
                </button>

                {/* Play/Pause */}
                <button
                  type="button"
                  onClick={toggleTts}
                  className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-amber-600 text-white hover:bg-amber-500 transition-colors shadow-md shadow-amber-900/40 shrink-0"
                  title={isTtsPlaying ? 'Tạm dừng' : 'Phát âm thanh'}
                >
                  {isTtsPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4 fill-white" />
                  )}
                </button>

                {/* Skip forward */}
                <button
                  type="button"
                  onClick={() => {
                    if (currentTtsParagraph < paragraphsVi.length - 1) {
                      playTtsParagraph(currentTtsParagraph + 1);
                    }
                  }}
                  className="p-1.5 text-neutral-400 hover:text-white transition-colors shrink-0"
                  title="Đoạn sau"
                >
                  <SkipForward className="h-4 w-4" />
                </button>

                {/* Status info - safely constrained and truncated */}
                <div className="min-w-0 flex-1 overflow-hidden pr-1">
                  <p className="text-xs font-semibold text-amber-200 truncate">
                    {isTtsPlaying ? 'Đang đọc...' : 'Đọc giọng Tiếng Việt'}
                  </p>
                  <p className="text-[10px] text-neutral-400 truncate">
                    Đoạn {currentTtsParagraph + 1}/{paragraphsVi.length} • Phát nền
                  </p>
                </div>
              </div>

              {/* Speed & Stop Controls - Always protected with shrink-0 and z-10 */}
              <div className="flex items-center gap-1.5 shrink-0 relative z-10">
                {/* Clean Styled Speed Selector */}
                <div className="relative shrink-0">
                  <select
                    value={ttsSpeed}
                    onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                    className="appearance-none rounded-lg border border-neutral-700 bg-neutral-800 pl-2 pr-5 py-1 text-[11px] font-semibold text-amber-300 focus:outline-none focus:border-amber-500 cursor-pointer shadow-sm hover:bg-neutral-750 transition-colors"
                    title="Tốc độ đọc"
                  >
                    <option value="0.75">0.75x</option>
                    <option value="1.0">1.0x</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                    <option value="2.0">2.0x</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-amber-300/80" />
                </div>

                {/* Stop / Mute Button */}
                <button
                  type="button"
                  onClick={stopTts}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 transition-colors shrink-0"
                  title="Tắt âm thanh / Dừng đọc"
                >
                  <VolumeX className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Exclusively Vietnamese Voices Selection */}
            <div className="grid grid-cols-2 gap-2 border-t border-neutral-800/80 pt-2">
              <div className="min-w-0">
                <label className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider mb-0.5 truncate">
                  Phong Cách Giọng:
                </label>
                <select
                  value={voiceStyle}
                  onChange={(e) => handleSelectVoiceStyle(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-[11px] text-neutral-100 focus:outline-none truncate cursor-pointer"
                >
                  <option value="female-warm">🌸 Nữ Truyền Cảm</option>
                  <option value="male-deep">🎙️ Nam Trầm Ấm</option>
                  <option value="hero-epic">🗡️ Hào Sảng Kiếm Hiệp</option>
                  <option value="ancient-story">📖 Kể Chuyện Cổ Trang</option>
                  <option value="fast-flow">⚡ Đọc Lướt Nhanh</option>
                  <option value="night-calm">🌙 Đọc Đêm Khuya</option>
                  <option value="power-blade">⚔️ Kiếm Khí Hùng Hồn</option>
                </select>
              </div>

              <div className="min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <label className="block text-[9px] font-semibold text-neutral-400 uppercase tracking-wider truncate">
                    Giọng Thiết Bị (vi-VN):
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowVoiceHelpModal(true)}
                    className="text-[9px] text-amber-400 hover:text-amber-300 underline flex items-center gap-0.5 cursor-pointer"
                    title="Xem cách tải thêm giọng Việt miễn phí của Google/Apple/Samsung"
                  >
                    <HelpCircle className="h-2.5 w-2.5" />
                    <span>Thêm giọng free</span>
                  </button>
                </div>
                <select
                  value={selectedVoiceURI}
                  onChange={(e) => {
                    setSelectedVoiceURI(e.target.value);
                    if (isTtsPlaying) {
                      stopTts();
                      setTimeout(() => playTtsParagraph(currentTtsParagraph), 100);
                    }
                  }}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-[11px] text-neutral-100 focus:outline-none truncate cursor-pointer"
                >
                  {vietnameseVoices.length > 0 ? (
                    vietnameseVoices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {getFriendlyVoiceName(v)}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="">🇻🇳 Giọng Tiếng Việt Mặc Định (Hệ Thống)</option>
                      <option value="hint" disabled>ℹ️ Bấm 'Thêm giọng free' để tải giọng Nữ/Nam</option>
                    </>
                  )}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paragraph Retranslate Modal */}
      {selectedParagraphIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl border border-amber-900/40 bg-neutral-900 text-neutral-100 p-4 sm:p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5">
              <h3 className="font-serif text-xs sm:text-sm font-bold text-amber-200">
                Hiệu Đính Đoạn #{selectedParagraphIndex + 1}
              </h3>
              <button
                onClick={() => setSelectedParagraphIndex(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Current Vietnamese */}
            <div className="rounded-xl bg-neutral-950 p-2.5 space-y-1">
              <span className="text-[10px] font-mono text-neutral-400 uppercase">
                Bản dịch hiện tại:
              </span>
              <p className="text-xs text-neutral-200 leading-relaxed max-h-32 overflow-y-auto">
                {paragraphsVi[selectedParagraphIndex]}
              </p>
            </div>

            {/* Prompt input */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-amber-300">
                Yêu cầu AI chỉnh lại đoạn này:
              </label>
              <input
                type="text"
                value={retranslatePrompt}
                onChange={(e) => setRetranslatePrompt(e.target.value)}
                placeholder="VD: Đổi xưng hô lão phu, giọng hào sảng..."
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-100 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => playTtsParagraph(selectedParagraphIndex)}
                className="flex items-center space-x-1 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
              >
                <Volume2 className="h-3.5 w-3.5 text-amber-400" />
                <span>Nghe đoạn này</span>
              </button>

              <button
                onClick={handleRetranslateSingle}
                disabled={isRetranslating}
                className="flex items-center space-x-1.5 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50 shadow"
              >
                {isRetranslating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Đang dịch...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Dịch Lại</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reader Settings Drawer with AI Translation Engine Selector */}
      {showSettingsDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xs sm:max-w-sm h-full bg-neutral-900 border-l border-neutral-800 p-5 overflow-y-auto space-y-5 text-neutral-100">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="font-serif text-sm font-bold text-amber-200">Cài Đặt Đọc Truyện</h3>
              <button
                onClick={() => setShowSettingsDrawer(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* AI Translation Engine Selector */}
            <div className="space-y-2 rounded-xl border border-amber-900/40 bg-neutral-950 p-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-300">
                Công Cụ Dịch Thuật:
              </label>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, aiModel: 'google-translate' })}
                  className={`w-full text-left rounded-lg p-2 text-xs border transition-all ${
                    settings.aiModel === 'google-translate'
                      ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 font-bold'
                      : 'border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>⚡ Google Dịch</span>
                    <span className="text-[10px] text-emerald-400 font-mono">Free & Nhanh</span>
                  </div>
                  <p className="text-[10px] text-neutral-400 font-normal mt-0.5">
                    Dịch sát nghĩa, tốc độ cao không lo chờ đợi.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, aiModel: 'gemini-3.1-flash-lite' })}
                  className={`w-full text-left rounded-lg p-2 text-xs border transition-all ${
                    settings.aiModel === 'gemini-3.1-flash-lite'
                      ? 'border-amber-500 bg-amber-950/40 text-amber-300 font-bold'
                      : 'border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>🌸 Gemini AI Flash Lite</span>
                    <span className="text-[10px] text-amber-400 font-mono">Khuyên Dùng</span>
                  </div>
                  <p className="text-[10px] text-neutral-400 font-normal mt-0.5">
                    Dịch mượt chuẩn văn phong tiên hiệp cổ trang.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, aiModel: 'gemini-3.8-flash' })}
                  className={`w-full text-left rounded-lg p-2 text-xs border transition-all ${
                    settings.aiModel === 'gemini-3.8-flash'
                      ? 'border-amber-500 bg-amber-950/40 text-amber-300 font-bold'
                      : 'border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>🔮 Gemini AI 3.8 Flash</span>
                    <span className="text-[10px] text-amber-400 font-mono">Chuyên Sâu</span>
                  </div>
                  <p className="text-[10px] text-neutral-400 font-normal mt-0.5">
                    Phân tích bối cảnh và đối thoại sâu.
                  </p>
                </button>
              </div>
            </div>

            {/* Theme Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400">
                Màu Nền:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onUpdateSettings({ ...settings, theme: 'sepia' })}
                  className={`flex items-center space-x-2 rounded-xl p-2.5 text-xs font-semibold border ${
                    settings.theme === 'sepia'
                      ? 'border-amber-500 ring-1 ring-amber-500'
                      : 'border-neutral-700'
                  } bg-[#f4ecd8] text-[#3c2a1e]`}
                >
                  <span className="h-3.5 w-3.5 rounded-full bg-[#3c2a1e]" />
                  <span>Giấy Cổ Trang</span>
                </button>

                <button
                  onClick={() => onUpdateSettings({ ...settings, theme: 'dark' })}
                  className={`flex items-center space-x-2 rounded-xl p-2.5 text-xs font-semibold border ${
                    settings.theme === 'dark'
                      ? 'border-amber-500 ring-1 ring-amber-500'
                      : 'border-neutral-700'
                  } bg-neutral-950 text-neutral-100`}
                >
                  <span className="h-3.5 w-3.5 rounded-full bg-neutral-200" />
                  <span>Tối OLED</span>
                </button>

                <button
                  onClick={() => onUpdateSettings({ ...settings, theme: 'bamboo' })}
                  className={`flex items-center space-x-2 rounded-xl p-2.5 text-xs font-semibold border ${
                    settings.theme === 'bamboo'
                      ? 'border-amber-500 ring-1 ring-amber-500'
                      : 'border-neutral-700'
                  } bg-[#eaf1ea] text-[#1b3422]`}
                >
                  <span className="h-3.5 w-3.5 rounded-full bg-[#1b3422]" />
                  <span>Trúc Diệp</span>
                </button>

                <button
                  onClick={() => onUpdateSettings({ ...settings, theme: 'midnight' })}
                  className={`flex items-center space-x-2 rounded-xl p-2.5 text-xs font-semibold border ${
                    settings.theme === 'midnight'
                      ? 'border-amber-500 ring-1 ring-amber-500'
                      : 'border-neutral-700'
                  } bg-[#0f172a] text-[#e2e8f0]`}
                >
                  <span className="h-3.5 w-3.5 rounded-full bg-sky-300" />
                  <span>Mực Đêm</span>
                </button>
              </div>
            </div>

            {/* Font Family */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400">
                Phông Chữ:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onUpdateSettings({ ...settings, fontFamily: 'font-reading' })}
                  className={`rounded-xl border p-2 text-xs font-medium ${
                    settings.fontFamily === 'font-reading'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                      : 'border-neutral-700 text-neutral-300'
                  }`}
                >
                  Be Vietnam Pro
                </button>
                <button
                  onClick={() => onUpdateSettings({ ...settings, fontFamily: 'font-serif' })}
                  className={`rounded-xl border p-2 text-xs font-serif ${
                    settings.fontFamily === 'font-serif'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                      : 'border-neutral-700 text-neutral-300'
                  }`}
                >
                  Merriweather Serif
                </button>
              </div>
            </div>

            {/* Font Size */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-neutral-400">Cỡ Chữ:</span>
                <span className="text-amber-400 font-bold">{settings.fontSize}px</span>
              </div>
              <input
                type="range"
                min="14"
                max="28"
                value={settings.fontSize}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, fontSize: parseInt(e.target.value) })
                }
                className="w-full accent-amber-500"
              />
            </div>

            {/* Line Height */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-neutral-400">Giãn Dòng:</span>
                <span className="text-amber-400 font-bold">{settings.lineHeight}x</span>
              </div>
              <input
                type="range"
                min="1.4"
                max="2.4"
                step="0.1"
                value={settings.lineHeight}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, lineHeight: parseFloat(e.target.value) })
                }
                className="w-full accent-amber-500"
              />
            </div>

            {/* Keep Screen Awake Toggle */}
            <div className="flex items-center justify-between border-t border-neutral-800 pt-3">
              <div>
                <p className="text-xs font-semibold text-neutral-200">Giữ Màn Hình Luôn Sáng</p>
                <p className="text-[10px] text-neutral-400">Không tự tắt khi đang đọc</p>
              </div>
              <input
                type="checkbox"
                checked={settings.keepScreenOn}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, keepScreenOn: e.target.checked })
                }
                className="h-4 w-4 accent-amber-500 rounded"
              />
            </div>
          </div>
        </div>
      )}

      {/* Chapter Quick Picker Drawer */}
      {showChapterDrawer && (
        <div className="fixed inset-0 z-50 flex justify-start bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xs sm:max-w-sm h-full bg-neutral-900 border-r border-neutral-800 p-4 overflow-y-auto space-y-3 text-neutral-100">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="font-serif text-sm font-bold text-amber-200">Mục Lục Chương</h3>
              <button
                onClick={() => setShowChapterDrawer(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-[85vh] overflow-y-auto pr-1">
              {novel.chapters.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => {
                    stopTts();
                    onNavigateChapter(ch.index);
                    setShowChapterDrawer(false);
                  }}
                  className={`w-full flex items-center justify-between rounded-lg p-2.5 text-left text-xs transition-colors ${
                    ch.index === chapterIndex
                      ? 'bg-amber-600 text-white font-bold'
                      : 'hover:bg-neutral-800 text-neutral-300'
                  }`}
                >
                  <span className="truncate pr-2">
                    {ch.index}. {ch.titleVi || ch.titleZh}
                  </span>
                  {ch.isTranslated && (
                    <span className="shrink-0 text-[9px] font-mono opacity-80">Đã dịch</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Voice Help Modal for Free Vietnamese Device Voices */}
      {showVoiceHelpModal && (
        <div
          data-interactive="true"
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-amber-900/40 bg-neutral-900 text-neutral-100 p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center space-x-2">
                <Headphones className="h-5 w-5 text-amber-400" />
                <h3 className="font-serif text-sm sm:text-base font-bold text-amber-200">
                  Cài Đặt Giọng Tiếng Việt Miễn Phí Trên Thiết Bị
                </h3>
              </div>
              <button
                onClick={() => setShowVoiceHelpModal(false)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Điện thoại Android và iPhone đều tích hợp sẵn nhiều giọng đọc Tiếng Việt (Nam & Nữ) chất lượng cao hoàn toàn <strong>miễn phí 100%</strong> của Google, Samsung và Apple. Bạn chỉ cần tải một lần vào máy là dùng vĩnh viễn không cần cài ứng dụng ngoài:
            </p>

            {/* Android Guide */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5 space-y-2">
              <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <span>📱</span> Điện thoại Android (Samsung, Xiaomi, Oppo, Realme, Vivo, Google Pixel)
              </h4>
              <ol className="text-[11px] text-neutral-300 space-y-1.5 list-decimal list-inside pl-1">
                <li>Mở <strong>Cài đặt</strong> (Settings) của điện thoại.</li>
                <li>Tìm mục <strong>Chuyển văn bản thành giọng nói</strong> (Text-to-Speech / TTS) trong <em>Quản lý chung</em> hoặc <em>Hỗ trợ tiếp cận / Trợ năng</em>.</li>
                <li>Bấm vào biểu tượng bánh răng bên cạnh <strong>Google Speech Services</strong> hoặc <strong>Samsung TTS</strong>.</li>
                <li>Chọn <strong>Cài đặt dữ liệu thoại (Voice data)</strong> ➔ Tìm và bấm tải gói <strong>Tiếng Việt</strong>.</li>
                <li>Sau khi tải xong, quay lại ứng dụng sẽ thấy các giọng Nam/Nữ xuất hiện trong danh sách!</li>
              </ol>
            </div>

            {/* iOS Guide */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5 space-y-2">
              <h4 className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                <span>🍏</span> iPhone & iPad (iOS)
              </h4>
              <ol className="text-[11px] text-neutral-300 space-y-1.5 list-decimal list-inside pl-1">
                <li>Mở <strong>Cài đặt</strong> (Settings) trên iPhone/iPad.</li>
                <li>Vào <strong>Trợ năng</strong> (Accessibility) ➔ Chọn <strong>Nội dung được đọc</strong> (Spoken Content).</li>
                <li>Chọn <strong>Giọng nói</strong> (Voices) ➔ Cuộn xuống chọn <strong>Tiếng Việt</strong>.</li>
                <li>Tải miễn phí giọng <strong>Linh</strong> hoặc <strong>Thu</strong> (giọng tự nhiên chất lượng cao).</li>
                <li>Quay lại ứng dụng đọc truyện để nghe giọng đọc siêu chuẩn!</li>
              </ol>
            </div>

            {/* Windows / Mac */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3.5 space-y-2">
              <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <span>💻</span> Máy tính Windows / MacBook
              </h4>
              <p className="text-[11px] text-neutral-300">
                • Trình duyệt <strong>Microsoft Edge</strong> và <strong>Google Chrome</strong> đã tích hợp sẵn giọng AI tự nhiên miễn phí <em>Hoài My</em> và <em>Nam Minh</em>.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowVoiceHelpModal(false)}
                className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 shadow"
              >
                Đã Hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
