export type ReaderTheme = 'sepia' | 'dark' | 'light' | 'bamboo' | 'midnight';
export type DualViewMode = 'vietnamese-only' | 'parallel' | 'interleaved';

export interface GlossaryTerm {
  id: string;
  novelId?: string; // If undefined or 'global', applies to all
  zh: string;
  vi: string;
  category: 'realm' | 'character' | 'sect' | 'item' | 'term' | 'pronoun';
  notes?: string;
  updatedAt?: string;
}

export interface TranslationQAResult {
  isValid: boolean;
  score: number;
  issues: string[];
  inconsistentNames: string[];
  missingParagraphsDetected: boolean;
  notes: string;
}

export interface Chapter {
  id: string;
  novelId: string;
  index: number;
  titleZh: string;
  titleVi?: string;
  sourceUrl?: string;
  paragraphsZh: string[];
  paragraphsVi?: string[];
  summary?: string;
  isTranslated: boolean;
  isTranslating?: boolean;
  translationProgress?: number; // 0 - 100
  qaReport?: TranslationQAResult;
  translatedAt?: string;
  lastReadOffset?: number;
}

export interface Novel {
  id: string;
  titleVi: string;
  titleZh: string;
  author: string;
  synopsis: string;
  coverUrl?: string;
  sourceUrl: string;
  sourceDomain: string;
  totalChapters: number;
  lastReadChapterIndex: number;
  lastReadAt?: string;
  createdAt: string;
  chapters: Chapter[];
  memory: {
    characters: Record<string, { zh: string; vi: string; role?: string; gender?: string }>;
    realms: Record<string, string>;
    sects: Record<string, string>;
    items: Record<string, string>;
    customGlossary: Record<string, string>;
    synopsis?: string;
    chapterSummaries?: Record<number, string>;
  };
}

export interface ReaderSettings {
  theme: ReaderTheme;
  fontFamily: 'font-vietnam' | 'font-serif' | 'font-reading' | 'font-cinzel';
  fontSize: number; // 14 to 32
  lineHeight: number; // 1.4 to 2.4
  paragraphSpacing: number; // 1.0 to 2.5
  contentWidth: 'compact' | 'normal' | 'wide';
  dualViewMode: DualViewMode;
  keepScreenOn: boolean;
  autoPrefetchNextChapters: number; // 0 to 3
  aiModel: string;
  ttsSpeed: number; // 0.75 to 2.0
  ttsEngine: 'web' | 'gemini';
  ttsVoice: string;
}

export interface ExtractedPreview {
  type: 'novel' | 'chapter';
  title: string;
  originalTitleZh: string;
  author: string;
  description: string;
  coverUrl?: string;
  sourceUrl: string;
  sourceDomain: string;
  chapters: { title: string; url: string; index: number }[];
  chapterContentZh?: string;
  chapterCleanedParagraphs?: string[];
}
