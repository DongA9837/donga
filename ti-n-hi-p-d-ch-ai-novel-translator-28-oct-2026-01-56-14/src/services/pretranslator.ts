/**
 * Background Pre-Translation Manager
 * Automatically pre-translates the next 5 chapters in the background while user reads,
 * fetching chapter contents via rotating proxy if needed, and saving translated results.
 */

import { Novel, Chapter } from '../types/novel';
import { translateChapterApi, extractFromUrlApi } from './api';
import { broadcastProgressUpdate, syncProgressWithServer } from './sync';

export interface PretranslateStatus {
  isActive: boolean;
  isPaused: boolean;
  currentTranslatingIndex: number | null;
  targetChapterIndices: number[];
  completedIndices: number[];
  failedIndices: number[];
  lastError: string | null;
}

type StatusListener = (status: PretranslateStatus) => void;

class PretranslatorQueue {
  private activeNovel: Novel | null = null;
  private currentChapterIndex: number = 1;
  private aiModel: string = 'gemini-3.1-flash-lite';
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private abortController: AbortController | null = null;
  private listeners: Set<StatusListener> = new Set();
  private onChapterDoneCallback: ((updatedNovel: Novel, finishedChapter: Chapter) => void) | null = null;

  private currentTranslatingIndex: number | null = null;
  private targetChapterIndices: number[] = [];
  private completedIndices: number[] = [];
  private failedIndices: number[] = [];
  private lastError: string | null = null;

  public subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    this.notify();
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const status: PretranslateStatus = {
      isActive: this.isRunning,
      isPaused: this.isPaused,
      currentTranslatingIndex: this.currentTranslatingIndex,
      targetChapterIndices: [...this.targetChapterIndices],
      completedIndices: [...this.completedIndices],
      failedIndices: [...this.failedIndices],
      lastError: this.lastError,
    };
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (e) {
        console.error('Error in pretranslator listener:', e);
      }
    }
  }

  public setCallback(cb: (updatedNovel: Novel, finishedChapter: Chapter) => void) {
    this.onChapterDoneCallback = cb;
  }

  public togglePause() {
    this.isPaused = !this.isPaused;
    this.notify();
    if (!this.isPaused && !this.isRunning) {
      this.runQueue();
    }
  }

  /**
   * Start or update background pre-translation for the next 5 chapters
   */
  public updateQueue(novel: Novel, currentChapterIndex: number, aiModel: string) {
    this.activeNovel = novel;
    this.currentChapterIndex = currentChapterIndex;
    this.aiModel = aiModel || 'gemini-3.1-flash-lite';

    // Calculate next 5 chapters
    const next5Indices: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const idx = currentChapterIndex + i;
      if (idx <= novel.chapters.length) {
        next5Indices.push(idx);
      }
    }

    this.targetChapterIndices = next5Indices;
    // Check which ones are already completed
    this.completedIndices = next5Indices.filter((idx) => {
      const ch = novel.chapters.find((c) => c.index === idx);
      return ch && ch.isTranslated && (ch.paragraphsVi?.length || 0) > 0;
    });

    this.notify();

    if (!this.isRunning && !this.isPaused) {
      this.runQueue();
    }
  }

  private async runQueue() {
    if (this.isRunning || this.isPaused || !this.activeNovel) return;
    this.isRunning = true;
    this.abortController = new AbortController();

    try {
      while (!this.isPaused && this.activeNovel) {
        // Find next untranslated chapter in target list
        const nextIdxToTranslate = this.targetChapterIndices.find(
          (idx) =>
            !this.completedIndices.includes(idx) &&
            !this.failedIndices.includes(idx)
        );

        if (!nextIdxToTranslate) {
          // All 5 target chapters are either completed or failed
          break;
        }

        const chapter = this.activeNovel.chapters.find((c) => c.index === nextIdxToTranslate);
        if (!chapter) {
          this.failedIndices.push(nextIdxToTranslate);
          continue;
        }

        // If already translated
        if (chapter.isTranslated && (chapter.paragraphsVi?.length || 0) > 0) {
          if (!this.completedIndices.includes(nextIdxToTranslate)) {
            this.completedIndices.push(nextIdxToTranslate);
          }
          this.notify();
          continue;
        }

        this.currentTranslatingIndex = nextIdxToTranslate;
        this.notify();

        try {
          let paragraphsZh = chapter.paragraphsZh || [];

          // If chapter content is empty but has sourceUrl, auto-extract it first
          if (paragraphsZh.length === 0 && chapter.sourceUrl) {
            console.log(`[Pretranslator] Đang tải trước văn bản tiếng Trung chương ${chapter.index} từ URL: ${chapter.sourceUrl}`);
            const extracted = await extractFromUrlApi(chapter.sourceUrl);
            if (extracted.chapterCleanedParagraphs && extracted.chapterCleanedParagraphs.length > 0) {
              paragraphsZh = extracted.chapterCleanedParagraphs;
            }
          }

          if (paragraphsZh.length === 0) {
            // Cannot translate empty paragraphs
            this.failedIndices.push(nextIdxToTranslate);
            this.notify();
            continue;
          }

          console.log(`[Pretranslator] Đang tự động dịch trước chương ${chapter.index}: "${chapter.titleZh}" bằng ${this.aiModel}`);

          const result = await translateChapterApi({
            chapterTitleZh: chapter.titleZh,
            paragraphsZh,
            memory: this.activeNovel.memory,
            model: this.aiModel,
          });

          if (result && this.activeNovel) {
            const updatedChapter: Chapter = {
              ...chapter,
              titleVi: result.chapterTitleVi,
              paragraphsZh,
              paragraphsVi: result.translatedParagraphs,
              summary: result.summary,
              qaReport: result.qaReport,
              isTranslated: true,
              translatedAt: new Date().toISOString(),
            };

            const updatedChapters = this.activeNovel.chapters.map((c) =>
              c.index === nextIdxToTranslate ? updatedChapter : c
            );

            this.activeNovel = {
              ...this.activeNovel,
              chapters: updatedChapters,
            };

            this.completedIndices.push(nextIdxToTranslate);
            this.lastError = null;

            // Notify app & storage
            if (this.onChapterDoneCallback) {
              this.onChapterDoneCallback(this.activeNovel, updatedChapter);
            }

            // Sync with other tabs and server
            broadcastProgressUpdate(this.activeNovel.id, this.currentChapterIndex, updatedChapter);
            syncProgressWithServer({
              novelId: this.activeNovel.id,
              chapterIndex: this.currentChapterIndex,
              chapterData: updatedChapter,
            });

            console.log(`[Pretranslator] ✓ Hoàn thành dịch trước chương ${nextIdxToTranslate}: ${result.chapterTitleVi}`);
          }
        } catch (err: any) {
          console.warn(`[Pretranslator] Lỗi khi dịch trước chương ${nextIdxToTranslate}:`, err.message);
          this.failedIndices.push(nextIdxToTranslate);
          this.lastError = err.message || 'Lỗi dịch chương';
        }

        this.currentTranslatingIndex = null;
        this.notify();

        // Pause 400ms between requests to avoid overloading server/API
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    } finally {
      this.isRunning = false;
      this.currentTranslatingIndex = null;
      this.notify();
    }
  }

  public stop() {
    this.isPaused = true;
    this.isRunning = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.currentTranslatingIndex = null;
    this.notify();
  }
}

export const pretranslator = new PretranslatorQueue();
