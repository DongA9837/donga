import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { extractFromUrl, cleanChineseNovelText } from './server/extractor.ts';
import {
  translateNovelChapter,
  extractEntitiesAndGlossary,
  retranslateSingleParagraph,
  NovelMemory,
} from './server/translator.ts';
import { BASE_XIANXIA_GLOSSARY } from './server/glossaryData.ts';
import { generateSpeechAudio } from './server/tts.ts';
import { proxyRotator } from './server/proxyRotator.ts';
import { syncStore } from './server/syncStore.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: '10mb' }));

  // API: Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: !!process.env.GEMINI_API_KEY,
      timestamp: new Date().toISOString(),
    });
  });

  // API: Get rotating proxy pool health and stats
  app.get('/api/proxy/status', (req, res) => {
    res.json({
      success: true,
      ...proxyRotator.getStats(),
    });
  });

  // API: Sync progress & chapter data between Web and App
  app.post('/api/sync/progress', (req, res) => {
    try {
      const { novelId, chapterIndex, lastReadAt, chapterData, clientDevice } = req.body;
      if (!novelId || chapterIndex === undefined) {
        return res.status(400).json({ success: false, error: 'Thiếu novelId hoặc chapterIndex.' });
      }

      const record = syncStore.updateProgress({
        novelId,
        chapterIndex: Number(chapterIndex),
        lastReadAt,
        chapterData,
        clientDevice,
      });

      res.json({ success: true, data: record });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API: Get synced progress for a novel
  app.get('/api/sync/progress/:novelId', (req, res) => {
    try {
      const { novelId } = req.params;
      const record = syncStore.getProgress(novelId);
      res.json({ success: true, data: record });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API: Get all synced records
  app.get('/api/sync/all', (req, res) => {
    res.json({ success: true, data: syncStore.getAllRecords() });
  });

  // API: Get base Xianxia glossary
  app.get('/api/glossary/base', (req, res) => {
    res.json({
      success: true,
      count: BASE_XIANXIA_GLOSSARY.length,
      glossary: BASE_XIANXIA_GLOSSARY,
    });
  });

  // API: Extract novel / chapter metadata and content from Chinese novel URL
  app.post('/api/extract/url', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ success: false, error: 'Thiếu đường dẫn URL cần phân tích.' });
      }

      const extracted = await extractFromUrl(url);
      res.json({ success: true, data: extracted });
    } catch (error: any) {
      console.error('URL extraction error:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Không thể trích xuất nội dung từ website này.',
      });
    }
  });

  // API: Clean raw Chinese text pasted by user
  app.post('/api/extract/raw-text', (req, res) => {
    try {
      const { title, rawText } = req.body;
      if (!rawText) {
        return res.status(400).json({ success: false, error: 'Vui lòng cung cấp nội dung văn bản tiếng Trung.' });
      }

      const cleanedParagraphs = cleanChineseNovelText(rawText);
      res.json({
        success: true,
        data: {
          title: title || 'Chương Tùy Chỉnh',
          cleanedParagraphs,
          paragraphCount: cleanedParagraphs.length,
        },
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  });

  // API: Extract entities and glossary terms from chapter
  app.post('/api/glossary/extract', async (req, res) => {
    try {
      const { chineseText, memory } = req.body;
      if (!chineseText) {
        return res.status(400).json({ success: false, error: 'Thiếu văn bản tiếng Trung.' });
      }

      const terms = await extractEntitiesAndGlossary(chineseText, memory);
      res.json({ success: true, terms });
    } catch (error: any) {
      console.error('Glossary extraction error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API: Translate full chapter with AI Translation Engine
  app.post('/api/translate', async (req, res) => {
    try {
      const { chapterTitleZh, paragraphsZh, memory, model } = req.body;

      if (!paragraphsZh || !Array.isArray(paragraphsZh) || paragraphsZh.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Thiếu danh sách các đoạn văn bản tiếng Trung cần dịch.',
        });
      }

      const modelToUse = model || 'gemini-3.8-flash';
      const translationResult = await translateNovelChapter(
        chapterTitleZh || 'Chương mới',
        paragraphsZh,
        memory as Partial<NovelMemory>,
        modelToUse
      );

      res.json({ success: true, data: translationResult });
    } catch (error: any) {
      console.error('Translation error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Lỗi trong quá trình dịch thuật AI.',
      });
    }
  });

  // API: Re-translate a single paragraph with custom user instruction
  app.post('/api/translate/retranslate-paragraph', async (req, res) => {
    try {
      const { originalZh, currentVi, userInstruction, glossaryContext } = req.body;
      if (!originalZh) {
        return res.status(400).json({ success: false, error: 'Thiếu đoạn văn tiếng Trung gốc.' });
      }

      const retranslated = await retranslateSingleParagraph(
        originalZh,
        currentVi || '',
        userInstruction || 'Dịch lại cho mượt mà, đúng chuẩn văn phong tiên hiệp',
        glossaryContext || {}
      );

      res.json({ success: true, translatedVi: retranslated });
    } catch (error: any) {
      console.error('Retranslate error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API: Gemini Text-to-Speech audio generation
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, voice } = req.body;
      if (!text) {
        return res.status(400).json({ success: false, error: 'Thiếu nội dung văn bản để đọc.' });
      }

      const audioResult = await generateSpeechAudio(text, voice || 'Kore');
      res.json({ success: true, data: audioResult });
    } catch (error: any) {
      console.error('TTS error:', error);
      res.status(500).json({ success: false, error: error.message || 'Lỗi phát âm thanh TTS.' });
    }
  });

  // Setup Vite or static serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`[Tiên Hiệp Dịch Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
