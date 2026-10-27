import { ExtractedPreview, TranslationQAResult } from '../types/novel';

export interface TranslateApiResponse {
  success: boolean;
  data?: {
    chapterTitleVi: string;
    translatedParagraphs: string[];
    fullTextVi: string;
    detectedTerms: Array<{ zh: string; vi: string; category: any; notes?: string }>;
    qaReport: TranslationQAResult;
    summary: string;
  };
  error?: string;
}

export async function checkApiHealth(): Promise<{ status: string; hasApiKey: boolean }> {
  try {
    const res = await fetch('/api/health');
    return await res.json();
  } catch (e: any) {
    return { status: 'error', hasApiKey: false };
  }
}

export async function extractFromUrlApi(url: string): Promise<ExtractedPreview> {
  const res = await fetch('/api/extract/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Không thể trích xuất truyện từ URL này.');
  }

  return data.data;
}

export async function cleanRawTextApi(
  title: string,
  rawText: string
): Promise<{ title: string; cleanedParagraphs: string[]; paragraphCount: number }> {
  const res = await fetch('/api/extract/raw-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, rawText }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Lỗi khi xử lý văn bản tiếng Trung.');
  }

  return data.data;
}

export async function translateChapterApi(payload: {
  chapterTitleZh: string;
  paragraphsZh: string[];
  memory?: any;
  model?: string;
}): Promise<TranslateApiResponse['data']> {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Quá trình dịch AI gặp sự cố.');
  }

  return json.data;
}

export async function retranslateParagraphApi(payload: {
  originalZh: string;
  currentVi: string;
  userInstruction: string;
  glossaryContext?: Record<string, string>;
}): Promise<string> {
  const res = await fetch('/api/translate/retranslate-paragraph', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Không thể dịch lại đoạn văn.');
  }

  return json.translatedVi;
}

export async function fetchBaseGlossaryApi() {
  const res = await fetch('/api/glossary/base');
  const json = await res.json();
  return json.glossary || [];
}

export async function requestTtsAudioApi(text: string, voice?: string) {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Không thể tạo âm thanh đọc truyện.');
  }

  return json.data as { audioBase64: string; mimeType: string };
}
