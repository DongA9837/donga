import { Novel, Chapter, GlossaryTerm, ReaderSettings } from '../types/novel';
import { SAMPLE_NOVELS } from '../data/sampleNovels';

const STORAGE_KEYS = {
  NOVELS: 'tien_hiep_novels_v1',
  SETTINGS: 'tien_hiep_reader_settings_v1',
  GLOBAL_GLOSSARY: 'tien_hiep_global_glossary_v1',
};

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'sepia',
  fontFamily: 'font-reading',
  fontSize: 19,
  lineHeight: 1.8,
  paragraphSpacing: 1.6,
  contentWidth: 'normal',
  dualViewMode: 'vietnamese-only',
  keepScreenOn: false,
  autoPrefetchNextChapters: 1,
  aiModel: 'gemini-3.1-flash-lite',
  ttsSpeed: 1.0,
  ttsEngine: 'web',
  ttsVoice: 'vi-VN',
};

export function getStoredNovels(): Novel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NOVELS);
    if (raw === null) {
      saveNovels(SAMPLE_NOVELS);
      return SAMPLE_NOVELS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to parse stored novels:', e);
    return [];
  }
}

export function saveNovels(novels: Novel[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.NOVELS, JSON.stringify(novels));
  } catch (e) {
    console.error('Failed to save novels to local storage:', e);
  }
}

export function getStoredSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveStoredSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

export function getStoredGlobalGlossary(): GlossaryTerm[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.GLOBAL_GLOSSARY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredGlobalGlossary(terms: GlossaryTerm[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.GLOBAL_GLOSSARY, JSON.stringify(terms));
  } catch (e) {
    console.error('Failed to save global glossary:', e);
  }
}

/**
 * Generate complete SQLite DDL and data dump for offline database backup
 */
export function generateSQLiteExport(novels: Novel[]): string {
  let sql = `-- Tiên Hiệp Dịch SQLite Export Schema & Data
-- Ngày xuất: ${new Date().toISOString()}

CREATE TABLE IF NOT EXISTS novels (
    id TEXT PRIMARY KEY,
    title_vi TEXT NOT NULL,
    title_zh TEXT NOT NULL,
    author TEXT,
    synopsis TEXT,
    cover_url TEXT,
    source_url TEXT,
    source_domain TEXT,
    total_chapters INTEGER DEFAULT 0,
    last_read_chapter_index INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    novel_id TEXT NOT NULL,
    chapter_index INTEGER NOT NULL,
    title_zh TEXT NOT NULL,
    title_vi TEXT,
    paragraphs_zh TEXT, -- JSON array
    paragraphs_vi TEXT, -- JSON array
    summary TEXT,
    is_translated INTEGER DEFAULT 0,
    qa_score INTEGER,
    translated_at DATETIME,
    FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS glossary (
    id TEXT PRIMARY KEY,
    novel_id TEXT, -- NULL for global
    zh_term TEXT NOT NULL,
    vi_term TEXT NOT NULL,
    category TEXT,
    notes TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chapters_novel_idx ON chapters(novel_id, chapter_index);
CREATE INDEX IF NOT EXISTS idx_glossary_term ON glossary(zh_term);

-- Dữ liệu truyện
`;

  for (const novel of novels) {
    const esc = (str: string = '') => str.replace(/'/g, "''");
    sql += `\nINSERT OR REPLACE INTO novels (id, title_vi, title_zh, author, synopsis, cover_url, source_url, source_domain, total_chapters, last_read_chapter_index)
VALUES ('${esc(novel.id)}', '${esc(novel.titleVi)}', '${esc(novel.titleZh)}', '${esc(novel.author)}', '${esc(
      novel.synopsis
    )}', '${esc(novel.coverUrl || '')}', '${esc(novel.sourceUrl)}', '${esc(novel.sourceDomain)}', ${
      novel.totalChapters
    }, ${novel.lastReadChapterIndex});\n`;

    for (const chap of novel.chapters) {
      sql += `INSERT OR REPLACE INTO chapters (id, novel_id, chapter_index, title_zh, title_vi, paragraphs_zh, paragraphs_vi, summary, is_translated, qa_score, translated_at)
VALUES ('${esc(chap.id)}', '${esc(novel.id)}', ${chap.index}, '${esc(chap.titleZh)}', '${esc(
        chap.titleVi || ''
      )}', '${esc(JSON.stringify(chap.paragraphsZh))}', '${esc(
        JSON.stringify(chap.paragraphsVi || [])
      )}', '${esc(chap.summary || '')}', ${chap.isTranslated ? 1 : 0}, ${chap.qaReport?.score || 'NULL'}, ${
        chap.translatedAt ? `'${chap.translatedAt}'` : 'NULL'
      });\n`;
    }
  }

  return sql;
}
