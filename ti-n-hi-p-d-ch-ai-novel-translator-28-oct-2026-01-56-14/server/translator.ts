import { ai } from './gemini.ts';
import { BASE_XIANXIA_GLOSSARY, GlossaryItem } from './glossaryData.ts';
import { Type } from '@google/genai';

export interface NovelMemory {
  novelId: string;
  characters: Record<string, { zh: string; vi: string; role?: string; gender?: string }>;
  realms: Record<string, string>;
  sects: Record<string, string>;
  items: Record<string, string>;
  customGlossary: Record<string, string>;
  synopsis?: string;
  chapterSummaries?: Record<number, string>;
}

export interface TranslationQAResult {
  isValid: boolean;
  score: number; // 0 - 100
  issues: string[];
  inconsistentNames: string[];
  missingParagraphsDetected: boolean;
  notes: string;
}

export interface TranslationOutput {
  chapterTitleVi: string;
  translatedParagraphs: string[];
  fullTextVi: string;
  detectedTerms: GlossaryItem[];
  qaReport: TranslationQAResult;
  summary: string;
}

/**
 * Step 1 & 2: Entity & Glossary Extraction for a Chapter
 */
export async function extractEntitiesAndGlossary(
  chineseText: string,
  existingMemory?: Partial<NovelMemory>
): Promise<GlossaryItem[]> {
  try {
    const memoryContext = existingMemory
      ? `Danh sách nhân vật hiện có: ${Object.values(existingMemory.characters || {})
          .map((c) => `${c.zh} => ${c.vi}`)
          .join(', ')}
Cảnh giới: ${Object.entries(existingMemory.realms || {})
          .map(([zh, vi]) => `${zh} => ${vi}`)
          .join(', ')}`
      : '';

    const prompt = `Bạn là chuyên gia dịch thuật và biên tập tiểu thuyết Tiên Hiệp, Huyền Huyễn, Kiếm Hiệp Trung Quốc.
Hãy phân tích đoạn văn bản tiếng Trung sau và trích xuất các thực thể chính để bổ sung vào từ điển dịch thuật:
1. Tên nhân vật (chuyển âm Hán Việt chuẩn, trang nhã, đúng giới tính nếu nhận biết được).
2. Tông môn / Thế lực / Gia tộc / Địa danh.
3. Cảnh giới tu luyện (Luyện Khí, Trúc Cơ, Kim Đan...).
4. Công pháp / Thần thông / Pháp bảo / Đan dược.
5. Danh xưng xưng hô đặc thù (sư tôn, sư huynh, bổn tọa...).

${memoryContext}

Văn bản tiếng Trung:
"""
${chineseText.slice(0, 3500)}
"""`;

    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          systemInstruction:
            'Trích xuất thực thể Hán Việt chuẩn cho truyện tiên hiệp. Trả về JSON theo đúng schema.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                zh: { type: Type.STRING, description: 'Từ tiếng Trung nguyên tác' },
                vi: { type: Type.STRING, description: 'Bản dịch âm Hán Việt chuẩn tiểu thuyết' },
                category: {
                  type: Type.STRING,
                  description: 'Loại thực thể: character | realm | sect | item | term | pronoun',
                },
                notes: { type: Type.STRING, description: 'Ghi chú thêm về vai trò/ý nghĩa' },
              },
              required: ['zh', 'vi', 'category'],
            },
          },
        },
      });
    } catch (err: any) {
      console.warn('Fallback to direct extraction due to:', err.message);
      return [];
    }

    const parsed: GlossaryItem[] = JSON.parse(response.text || '[]');
    return parsed;
  } catch (err) {
    console.error('Error extracting glossary:', err);
    return [];
  }
}

/**
 * Merges base Xianxia glossary with novel-specific memory and newly detected entities.
 */
export function buildMergedGlossary(
  memory?: Partial<NovelMemory>,
  detectedItems: GlossaryItem[] = []
): Map<string, string> {
  const map = new Map<string, string>();

  // 1. Base Xianxia terms
  for (const item of BASE_XIANXIA_GLOSSARY) {
    map.set(item.zh, item.vi);
  }

  // 2. Novel memory terms
  if (memory) {
    if (memory.characters) {
      for (const [zh, c] of Object.entries(memory.characters)) {
        map.set(zh, c.vi);
      }
    }
    if (memory.realms) {
      for (const [zh, vi] of Object.entries(memory.realms)) {
        map.set(zh, vi);
      }
    }
    if (memory.sects) {
      for (const [zh, vi] of Object.entries(memory.sects)) {
        map.set(zh, vi);
      }
    }
    if (memory.items) {
      for (const [zh, vi] of Object.entries(memory.items)) {
        map.set(zh, vi);
      }
    }
    if (memory.customGlossary) {
      for (const [zh, vi] of Object.entries(memory.customGlossary)) {
        map.set(zh, vi);
      }
    }
  }

  // 3. Newly detected items
  for (const item of detectedItems) {
    map.set(item.zh, item.vi);
  }

  return map;
}

/**
 * Step 3: Literary Novel Translation Engine
 */
export async function translateNovelChapter(
  chapterTitleZh: string,
  paragraphsZh: string[],
  memory?: Partial<NovelMemory>,
  modelName: string = 'gemini-3.8-flash'
): Promise<TranslationOutput> {
  // Step 1: Detect entities in this chapter
  const combinedText = paragraphsZh.join('\n');
  const detectedTerms = await extractEntitiesAndGlossary(combinedText, memory);

  // Step 2: Build active glossary map
  const activeGlossaryMap = buildMergedGlossary(memory, detectedTerms);

  // Format glossary for prompt (prioritize terms appearing in this text)
  const relevantGlossaryLines: string[] = [];
  for (const [zh, vi] of activeGlossaryMap.entries()) {
    if (combinedText.includes(zh) || chapterTitleZh.includes(zh)) {
      relevantGlossaryLines.push(`${zh} -> ${vi}`);
    }
  }

  // Format previous context summary
  const prevSummary = memory?.synopsis ? `Tóm tắt bối cảnh cốt truyện:\n${memory.synopsis}\n` : '';

  const isGoogleTranslate = modelName === 'google-translate';
  const effectiveModel = isGoogleTranslate ? 'gemini-3.1-flash-lite' : (modelName || 'gemini-3.1-flash-lite');

  const systemInstruction = isGoogleTranslate
    ? `Bạn là cỗ máy Google Dịch (Google Translate) dịch nhanh tiếng Trung sang tiếng Việt.
YÊU CẦU:
1. Dịch trực tiếp, sát nghĩa, rõ ràng chuẩn xác ngữ pháp tiếng Việt.
2. Không tự ý sáng tác thêm hay cắt bớt. Giữ nguyên toàn bộ số lượng đoạn văn tương ứng 1-1 với bản gốc.
3. Thuật ngữ quen thuộc dễ hiểu.
QUY TẮC ĐẦU RA:
- Trả về JSON theo đúng định dạng gồm chapterTitleVi, translatedParagraphs (mảng các đoạn văn tiếng Việt tương ứng 1-1 với paragraphsZh), và summary (1 câu tóm tắt).`
    : `Bạn là Dịch Giả Tiểu Thuyết Tiên Hiệp, Huyền Huyễn, Kiếm Hiệp cao cấp hàng đầu Việt Nam.
Nhiệm vụ của bạn là dịch nguyên tác tiểu thuyết tiếng Trung sang tiếng Việt với chất lượng cao nhất, đạt tiêu chuẩn xuất bản hoặc các trang truyện lớn như bachngocsach, tangthuvien.

YÊU CẦU DỊCH THUẬT:
1. VĂN PHONG TIÊN HIỆP ĐỈNH CAO:
   - Câu văn mượt mà, thuần Việt kết hợp âm Hán Việt trang trọng, hào sảng, đúng phong vị tu tiên cổ trang.
   - Tránh dịch máy móc kiểu convert thô kệch (ví dụ không dịch "hắn nói rằng", hãy dịch "hắn trầm giọng nói", "gã cười lạnh", "y khẽ thở dài").
   - Tôn trọng ngữ khí nhân vật: lão quái vật xưng "lão phu" hoặc "bổn tọa", đệ tử xưng "đệ tử", sư tôn xưng "vi sư", đối thủ gọi "các hạ", "tiểu tử".
2. BẢO TOÀN NGUYÊN TÁC:
   - KHÔNG tự ý sáng tác thêm tình tiết, KHÔNG cắt bỏ đoạn văn nào.
   - Giữ nguyên số lượng đoạn văn tương ứng để người đọc có thể so sánh song ngữ.
3. NHẤT QUÁN THUẬT NGỮ (TUYỆT ĐỐI TUÂN THỦ TỪ ĐIỂN):
${relevantGlossaryLines.slice(0, 80).join('\n')}

QUY TẮC ĐẦU RA:
- Trả về JSON theo đúng định dạng gồm chapterTitleVi, translatedParagraphs (mảng các đoạn văn tiếng Việt tương ứng theo đúng thứ tự 1-1 với đoạn văn gốc), và summary (1-2 câu tóm tắt nội dung chính chương này).`;

  const inputPayload = {
    chapterTitleZh,
    paragraphsZh,
    previousContext: prevSummary,
  };

  const generateConfig = {
    systemInstruction,
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        chapterTitleVi: {
          type: Type.STRING,
          description: 'Tiêu đề chương dịch sang tiếng Việt',
        },
        translatedParagraphs: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Các đoạn văn tiếng Việt đã dịch, tương ứng từng đoạn với paragraphsZh',
        },
        summary: {
          type: Type.STRING,
          description: 'Tóm tắt ngắn gọn 1-2 câu diễn biến chính của chương để lưu vào bộ nhớ ngữ cảnh',
        },
      },
      required: ['chapterTitleVi', 'translatedParagraphs', 'summary'],
    },
  };

  let response;
  try {
    response = await ai.models.generateContent({
      model: effectiveModel,
      contents: JSON.stringify(inputPayload),
      config: generateConfig,
    });
  } catch (err: any) {
    console.warn(`Primary model ${effectiveModel} error (${err.message}), falling back to gemini-3.1-flash-lite`);
    response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: JSON.stringify(inputPayload),
      config: generateConfig,
    });
  }

  const parsed = JSON.parse(response.text || '{}');
  const chapterTitleVi = parsed.chapterTitleVi || chapterTitleZh;
  const translatedParagraphs: string[] = parsed.translatedParagraphs || [];
  const fullTextVi = translatedParagraphs.join('\n\n');
  const summary = parsed.summary || '';

  // Step 4: Quality Assurance (QA) Check
  const qaReport = performQACheck(
    chapterTitleZh,
    paragraphsZh,
    chapterTitleVi,
    translatedParagraphs,
    activeGlossaryMap
  );

  return {
    chapterTitleVi,
    translatedParagraphs,
    fullTextVi,
    detectedTerms,
    qaReport,
    summary,
  };
}

/**
 * Step 4: Automated Quality Assurance (QA) Engine
 */
export function performQACheck(
  chapterTitleZh: string,
  sourceParagraphs: string[],
  chapterTitleVi: string,
  translatedParagraphs: string[],
  glossaryMap: Map<string, string>
): TranslationQAResult {
  const issues: string[] = [];
  const inconsistentNames: string[] = [];
  let score = 100;

  // 1. Check paragraph count consistency
  const srcCount = sourceParagraphs.length;
  const trCount = translatedParagraphs.length;
  let missingParagraphsDetected = false;

  if (trCount < srcCount * 0.75) {
    missingParagraphsDetected = true;
    score -= 25;
    issues.push(`Phát hiện thiếu đoạn: Nguyên tác có ${srcCount} đoạn nhưng bản dịch chỉ có ${trCount} đoạn.`);
  }

  // 2. Check for leftover untranslated Chinese characters
  const chineseCharRegex = /[\u4e00-\u9fa5]/g;
  let leftoverChineseCount = 0;
  for (let i = 0; i < translatedParagraphs.length; i++) {
    const match = translatedParagraphs[i].match(chineseCharRegex);
    if (match) {
      leftoverChineseCount += match.length;
    }
  }

  if (leftoverChineseCount > 5) {
    score -= 15;
    issues.push(`Phát hiện ${leftoverChineseCount} ký tự chữ Hán chưa được dịch hết trong bản dịch.`);
  }

  // 3. Check consistency of character names against active glossary
  for (const [zh, expectedVi] of glossaryMap.entries()) {
    // Only test terms of length >= 2 that actually appear in source
    if (zh.length >= 2 && sourceParagraphs.some((p) => p.includes(zh))) {
      const fullViText = translatedParagraphs.join(' ');
      // If the expected term doesn't appear in translated text at all
      if (!fullViText.toLowerCase().includes(expectedVi.toLowerCase())) {
        inconsistentNames.push(`Thuật ngữ "${zh}" kỳ vọng dịch là "${expectedVi}" nhưng không tìm thấy.`);
      }
    }
  }

  if (inconsistentNames.length > 0) {
    score -= Math.min(20, inconsistentNames.length * 5);
  }

  // 4. Check for duplicate repetitive sentences (AI looping hallucination)
  const seenParagraphs = new Set<string>();
  let duplicates = 0;
  for (const p of translatedParagraphs) {
    if (p.length > 30) {
      if (seenParagraphs.has(p)) {
        duplicates++;
      } else {
        seenParagraphs.add(p);
      }
    }
  }
  if (duplicates > 1) {
    score -= 15;
    issues.push(`Phát hiện ${duplicates} đoạn văn bị lặp lại bất thường.`);
  }

  score = Math.max(0, Math.min(100, score));

  return {
    isValid: score >= 60,
    score,
    issues,
    inconsistentNames: inconsistentNames.slice(0, 5),
    missingParagraphsDetected,
    notes:
      score >= 85
        ? 'Chất lượng bản dịch xuất sắc, văn phong lưu loát, thuật ngữ chính xác.'
        : score >= 70
        ? 'Bản dịch đạt yêu cầu đọc tốt, có vài thuật ngữ cần lưu ý.'
        : 'Bản dịch cần biên tập hoặc dịch lại đoạn để đảm bảo chất lượng cao nhất.',
  };
}

/**
 * Re-translate a single paragraph with custom instruction
 */
export async function retranslateSingleParagraph(
  originalZh: string,
  currentVi: string,
  userInstruction: string,
  glossaryContext: Record<string, string>
): Promise<string> {
  const glossaryStr = Object.entries(glossaryContext)
    .map(([zh, vi]) => `${zh} -> ${vi}`)
    .join(', ');

  const prompt = `Bạn là dịch giả tiểu thuyết Tiên Hiệp cao cấp.
Đoạn văn gốc tiếng Trung:
"""
${originalZh}
"""

Bản dịch hiện tại:
"""
${currentVi}
"""

Yêu cầu chỉnh sửa của độc giả: "${userInstruction}"
Từ điển bắt buộc: ${glossaryStr}

Hãy dịch lại đoạn này sao cho chuẩn văn phong Tiên Hiệp Việt Nam, tuân thủ đúng yêu cầu chỉnh sửa và từ điển. Chỉ trả về nội dung đoạn văn dịch mới nhất, không kèm lời giải thích rườm rà.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: prompt,
  });

  return (response.text || currentVi).trim();
}
