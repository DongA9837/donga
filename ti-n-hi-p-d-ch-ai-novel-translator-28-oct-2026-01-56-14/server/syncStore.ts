/**
 * Cloud Sync Store for Tiên Hiệp Dịch
 * Synchronizes reading progress, chapter translation states, and novel libraries
 * seamlessly across Web browsers, mobile PWAs, and native device wrappers.
 */

export interface ChapterSyncData {
  index: number;
  titleZh: string;
  titleVi?: string;
  paragraphsZh?: string[];
  paragraphsVi?: string[];
  isTranslated: boolean;
  qaScore?: number;
  summary?: string;
  translatedAt?: string;
}

export interface NovelSyncRecord {
  novelId: string;
  lastReadChapterIndex: number;
  lastReadAt: string;
  totalChapters?: number;
  chapters: Record<number, ChapterSyncData>;
  clientDevice?: string;
}

class SyncStoreService {
  private storage: Map<string, NovelSyncRecord> = new Map();

  public updateProgress(payload: {
    novelId: string;
    chapterIndex: number;
    lastReadAt?: string;
    chapterData?: ChapterSyncData;
    clientDevice?: string;
  }): NovelSyncRecord {
    const { novelId, chapterIndex, lastReadAt, chapterData, clientDevice } = payload;
    let record = this.storage.get(novelId);

    if (!record) {
      record = {
        novelId,
        lastReadChapterIndex: chapterIndex,
        lastReadAt: lastReadAt || new Date().toISOString(),
        chapters: {},
        clientDevice,
      };
      this.storage.set(novelId, record);
    } else {
      record.lastReadChapterIndex = chapterIndex;
      record.lastReadAt = lastReadAt || new Date().toISOString();
      if (clientDevice) record.clientDevice = clientDevice;
    }

    if (chapterData) {
      record.chapters[chapterData.index] = {
        ...record.chapters[chapterData.index],
        ...chapterData,
      };
    }

    console.log(`[SyncStore] Đã đồng bộ tiến độ truyện ${novelId} -> Chương ${chapterIndex} (${clientDevice || 'Web/App'})`);
    return record;
  }

  public getProgress(novelId: string): NovelSyncRecord | null {
    return this.storage.get(novelId) || null;
  }

  public getAllRecords(): Record<string, NovelSyncRecord> {
    const out: Record<string, NovelSyncRecord> = {};
    for (const [k, v] of this.storage.entries()) {
      out[k] = v;
    }
    return out;
  }
}

export const syncStore = new SyncStoreService();
