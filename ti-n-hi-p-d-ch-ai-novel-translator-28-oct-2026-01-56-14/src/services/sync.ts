/**
 * Client-Side Sync Service for Web and App
 * Synchronizes reading progress, chapter states, and fullscreen preferences
 * across browser tabs, PWA instances, and server storage.
 */

import { Chapter, Novel } from '../types/novel';

export interface SyncMessage {
  type: 'PROGRESS_UPDATE' | 'CHAPTER_TRANSLATED' | 'SETTINGS_UPDATE';
  novelId: string;
  chapterIndex?: number;
  chapter?: Chapter;
  timestamp: string;
  senderId: string;
}

const CLIENT_ID = 'client_' + Math.random().toString(36).substring(2, 9);
let syncChannel: BroadcastChannel | null = null;

try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    syncChannel = new BroadcastChannel('tien_hiep_sync_channel');
  }
} catch (e) {
  console.warn('BroadcastChannel not supported in this environment');
}

/**
 * Detect client device environment (Web, PWA, iOS, Android)
 */
export function getDeviceClientLabel(): string {
  if (typeof window === 'undefined') return 'Server';
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;

  const ua = navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);

  if (isStandalone) {
    if (isIos) return 'iOS App (PWA)';
    if (isAndroid) return 'Android App (PWA)';
    return 'Desktop App (PWA)';
  }

  if (isIos) return 'Safari iOS Web';
  if (isAndroid) return 'Chrome Android Web';
  return 'Desktop Web';
}

/**
 * Broadcast progress update to all other open tabs / PWA windows
 */
export function broadcastProgressUpdate(novelId: string, chapterIndex: number, chapter?: Chapter) {
  if (!syncChannel) return;
  const msg: SyncMessage = {
    type: 'PROGRESS_UPDATE',
    novelId,
    chapterIndex,
    chapter,
    timestamp: new Date().toISOString(),
    senderId: CLIENT_ID,
  };
  syncChannel.postMessage(msg);
}

/**
 * Subscribe to sync messages from other tabs / windows
 */
export function subscribeToSync(onMessage: (msg: SyncMessage) => void): () => void {
  if (!syncChannel) return () => {};

  const handler = (event: MessageEvent<SyncMessage>) => {
    if (event.data && event.data.senderId !== CLIENT_ID) {
      onMessage(event.data);
    }
  };

  syncChannel.addEventListener('message', handler);
  return () => syncChannel?.removeEventListener('message', handler);
}

/**
 * Push reading progress and optional translated chapter to backend sync store
 */
export async function syncProgressWithServer(payload: {
  novelId: string;
  chapterIndex: number;
  chapterData?: Partial<Chapter>;
}) {
  try {
    const res = await fetch('/api/sync/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        novelId: payload.novelId,
        chapterIndex: payload.chapterIndex,
        lastReadAt: new Date().toISOString(),
        clientDevice: getDeviceClientLabel(),
        chapterData: payload.chapterData
          ? {
              index: payload.chapterData.index,
              titleZh: payload.chapterData.titleZh,
              titleVi: payload.chapterData.titleVi,
              paragraphsZh: payload.chapterData.paragraphsZh,
              paragraphsVi: payload.chapterData.paragraphsVi,
              isTranslated: payload.chapterData.isTranslated,
              qaScore: payload.chapterData.qaReport?.score,
              summary: payload.chapterData.summary,
              translatedAt: payload.chapterData.translatedAt,
            }
          : undefined,
      }),
    });
    return await res.json();
  } catch (err) {
    console.debug('[Sync] Offline or failed to reach sync server:', err);
    return null;
  }
}

/**
 * Pull latest synced progress from server
 */
export async function fetchServerProgress(novelId: string) {
  try {
    const res = await fetch(`/api/sync/progress/${encodeURIComponent(novelId)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch (err) {
    console.debug('[Sync] Failed to fetch server progress:', err);
    return null;
  }
}
