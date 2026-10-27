import * as cheerio from 'cheerio';
import { URL } from 'url';
import { proxyRotator } from './proxyRotator.ts';

export interface ExtractedChapter {
  title: string;
  url: string;
  index: number;
}

export interface ExtractedNovel {
  type: 'novel' | 'chapter';
  title: string;
  originalTitleZh: string;
  author: string;
  description: string;
  coverUrl?: string;
  sourceUrl: string;
  sourceDomain: string;
  chapters: ExtractedChapter[];
  // If it's a chapter URL
  chapterContentZh?: string;
  chapterCleanedParagraphs?: string[];
}

/**
 * Normalizes input URL string:
 * - Trims whitespace and invisible unicode chars
 * - Strips enclosing quotes or brackets (e.g., "https://...", <https://...>)
 * - Auto-prepends https:// if protocol is missing (e.g., www.example.com -> https://www.example.com)
 */
export function normalizeUrl(rawUrl: string): string {
  if (!rawUrl) {
    throw new Error('Vui lòng nhập đường dẫn URL tiểu thuyết.');
  }

  let cleaned = rawUrl.trim();
  // Remove markdown link syntax [label](url) if pasted
  const mdMatch = cleaned.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/i);
  if (mdMatch) {
    cleaned = mdMatch[1];
  }

  // Remove wrapping quotes, brackets, angle brackets
  cleaned = cleaned.replace(/^["'\[<`]+|["'\]>`]+$/g, '').trim();
  // Remove invisible unicode characters
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF\u00A0\s]+/g, ' ').trim();

  if (!cleaned) {
    throw new Error('Vui lòng nhập đường dẫn URL tiểu thuyết.');
  }

  // If no scheme, add https://
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }

  return cleaned;
}

/**
 * SSRF validation to prevent access to private networks or metadata endpoints.
 */
export function validateSafeUrl(rawUrl: string): URL {
  const normalized = normalizeUrl(rawUrl);
  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(
      `Định dạng URL "${rawUrl}" không hợp lệ. Vui lòng nhập link đầy đủ (ví dụ: https://example.com/book/12345/)`
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Chỉ hỗ trợ giao thức HTTP và HTTPS.');
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and internal IP ranges
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local')
  ) {
    throw new Error('Địa chỉ mạng nội bộ không được phép truy cập vì lý do an toàn.');
  }

  // Check IPv4 private ranges
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const b0 = parseInt(ipv4Match[1], 10);
    const b1 = parseInt(ipv4Match[2], 10);
    if (
      b0 === 10 ||
      (b0 === 172 && b1 >= 16 && b1 <= 31) ||
      (b0 === 192 && b1 === 168) ||
      (b0 === 169 && b1 === 254) // Link-local and cloud metadata
    ) {
      throw new Error('IP riêng tư hoặc Cloud Metadata không được phép truy cập.');
    }
  }

  return parsed;
}

/**
 * Cleans typical Chinese web novel ads, watermarks, and noise.
 */
export function cleanChineseNovelText(rawText: string): string[] {
  const adPatterns = [
    /请记住本书首发域名.*/i,
    /本书首发于.*/i,
    /最新章节请访问.*/i,
    /天[才才]一秒[记記]住.*/i,
    /顶点小说.*|笔趣阁.*|biquge.*/i,
    /手机用户请浏览.*/i,
    /ps[:：].*(求月票|求推荐|求收藏|感谢|打赏).*/i,
    /投推荐票.*|加入书签.*|上一页.*|下一页.*/i,
    /（本章未完.*）/i,
    /\(本章完\)/i,
    /readx\(\);?/i,
    /&nbsp;/g,
    /\r/g,
  ];

  let cleaned = rawText;
  for (const pattern of adPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Split into paragraphs by newline
  const paragraphs = cleaned
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => {
      if (p.length === 0) return false;
      // Skip lines that look like website navigation or ads
      if (p.length < 5 && (p.includes('上一章') || p.includes('下一章') || p.includes('目录'))) {
        return false;
      }
      return true;
    });

  return paragraphs;
}

/**
 * Fetches and decodes web page supporting UTF-8, GBK, GB2312, Big5 with continuous proxy rotation.
 */
async function fetchPageWithEncoding(targetUrl: string): Promise<{ html: string; finalUrl: string }> {
  const parsed = validateSafeUrl(targetUrl);
  const normalizedUrl = parsed.toString();

  const result = await proxyRotator.fetchWithRotation(normalizedUrl);
  return { html: result.html, finalUrl: result.finalUrl };
}

/**
 * Universal extractor for Chinese novel sites (Qidian, Biquge, 69shu, UUkan, etc.)
 */
export async function extractFromUrl(targetUrl: string): Promise<ExtractedNovel> {
  const parsedUrl = validateSafeUrl(targetUrl);
  const normalizedUrl = parsedUrl.toString();

  // Handle demonstration / test domain `example.com` (as specified in user prompt: "Ví dụ: https://example.com/book/12345/")
  if (parsedUrl.hostname === 'example.com' || parsedUrl.hostname.endsWith('.example.com')) {
    const isSingleChapter = parsedUrl.pathname.includes('/chapter/') || parsedUrl.pathname.endsWith('.html');
    if (isSingleChapter) {
      const sampleParagraphs = [
        '二愣子坐在村头的大青石上，呆呆地看着远处连绵起伏的青牛山。',
        '二愣子本名韩立，是五里沟一个极其普通的农家少年。因为在家里排行老四，皮肤略黑，平日里话不多，村里人都习惯叫他二愣子。',
        '今天，二愣子的大伯从城里赶了回来，给家里带来了一个天大的好消息。',
        '城里有一家赫赫有名的大门派——七玄门，每五年都会在各地招收一批内门弟子。',
        '“四叔，二愣子这孩子打小就机灵，身子骨也结实，不如让他跟着我去试一试？”大伯抽着旱烟说道。',
        '韩父沉默了许久，终于咬牙点了点头。年幼的韩立并不知道，这一去，不仅踏入了凶险莫测的江湖，更悄然揭开了波澜壮阔的修仙篇章。',
      ];
      return {
        type: 'chapter',
        title: '第一章 山边小村',
        originalTitleZh: '第一章 山边小村',
        author: '忘语 (Vong Ngữ)',
        description: 'Thiếu niên bình thường Hàn Lập tình cờ gia nhập Thất Huyền Môn, bước lên tiên lộ.',
        coverUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
        sourceUrl: normalizedUrl,
        sourceDomain: 'example.com',
        chapters: [{ title: '第一章 山边小村', url: normalizedUrl, index: 1 }],
        chapterContentZh: sampleParagraphs.join('\n\n'),
        chapterCleanedParagraphs: sampleParagraphs,
      };
    }

    // Default book catalog demo
    return {
      type: 'novel',
      title: '凡人修仙录 (Phàm Nhân Tu Tiên Lục)',
      originalTitleZh: '凡人修仙录',
      author: '忘语 (Vong Ngữ)',
      description:
        'Một thiếu niên bình phàm nơi sơn thôn nghèo khó, vô tình bước lên con đường tu tiên nguy hiểm trùng trùng, từng bước đúc thành truyền kỳ bất hủ.',
      coverUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
      sourceUrl: normalizedUrl,
      sourceDomain: 'example.com',
      chapters: [
        { title: '第一章 山边小村', url: 'https://example.com/chapter/1/', index: 1 },
        { title: '第二章 七玄门与墨大夫', url: 'https://example.com/chapter/2/', index: 2 },
        { title: '第三章 神秘小绿瓶', url: 'https://example.com/chapter/3/', index: 3 },
        { title: '第四章 修炼长春功', url: 'https://example.com/chapter/4/', index: 4 },
        { title: '第五章 灵药催生之术', url: 'https://example.com/chapter/5/', index: 5 },
      ],
    };
  }

  const { html, finalUrl } = await fetchPageWithEncoding(normalizedUrl);
  const $ = cheerio.load(html);

  // Check if page is protected by Cloudflare / Captcha
  const bodyText = $('body').text();
  if (
    bodyText.includes('Just a moment...') ||
    bodyText.includes('cf-browser-verification') ||
    bodyText.includes('Attention Required! | Cloudflare') ||
    $('input[name="cf_captcha_kind"]').length > 0
  ) {
    throw new Error(
      'Trang web này được bảo vệ bởi Cloudflare hoặc CAPTCHA chống cào tự động. Hãy sao chép nội dung văn bản tiếng Trung và dán trực tiếp vào tab "Nhập Trực Tiếp (Văn Bản Tiếng Trung)".'
    );
  }

  // 1. Detect Title
  let title =
    $('meta[property="og:novel:book_name"]').attr('content') ||
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text().trim() ||
    $('.book-info h1').text().trim() ||
    $('#info h1').text().trim() ||
    $('title').text().trim();

  // Clean title noise like "_笔趣阁", "_小说最新章节"
  title = title.replace(/_.*$/, '').replace(/-.*$/, '').trim();

  // 2. Detect Author
  let author =
    $('meta[property="og:novel:author"]').attr('content') ||
    $('meta[name="author"]').attr('content') ||
    $('.author').first().text().trim() ||
    $('#info p:contains("作")').first().text().replace(/作\s*者[：:]/, '').trim() ||
    'Khuyết danh';

  // 3. Detect Description
  let description =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    $('#intro').text().trim() ||
    $('.intro').text().trim() ||
    $('.book-intro').text().trim() ||
    '';
  description = description.replace(/\s+/g, ' ').trim();

  // 4. Detect Cover Image
  let coverUrl =
    $('meta[property="og:image"]').attr('content') ||
    $('.book-img img').attr('src') ||
    $('#fmimg img').attr('src') ||
    $('.cover img').attr('src');

  if (coverUrl && !coverUrl.startsWith('http')) {
    try {
      coverUrl = new URL(coverUrl, finalUrl).toString();
    } catch {
      coverUrl = undefined;
    }
  }

  // 5. Detect if it's a Single Chapter Page
  const chapterContentEl = $(
    '#content, #txtContent, #htmlContent, .content, .read-content, .showtxt, .txtnav, #chaptercontent'
  ).first();

  const isChapterPage = chapterContentEl.length > 0 && chapterContentEl.text().length > 150;

  if (isChapterPage) {
    // Extract chapter title
    const chapterTitle =
      $('h1').first().text().trim() ||
      $('.bookname h1').text().trim() ||
      $('.title').first().text().trim() ||
      title;

    // Convert <br> or <p> into newlines before text extraction
    chapterContentEl.find('br').replaceWith('\n');
    chapterContentEl.find('p').each((_, el) => {
      $(el).append('\n');
    });

    const rawChapterText = chapterContentEl.text();
    const cleanedParagraphs = cleanChineseNovelText(rawChapterText);

    return {
      type: 'chapter',
      title: chapterTitle,
      originalTitleZh: chapterTitle,
      author,
      description,
      coverUrl,
      sourceUrl: normalizedUrl,
      sourceDomain: parsedUrl.hostname,
      chapters: [
        {
          title: chapterTitle,
          url: normalizedUrl,
          index: 1,
        },
      ],
      chapterContentZh: cleanedParagraphs.join('\n\n'),
      chapterCleanedParagraphs: cleanedParagraphs,
    };
  }

  // 6. Detect Chapter List (Book Index Page)
  const chapters: ExtractedChapter[] = [];
  const seenUrls = new Set<string>();

  // Look for chapter links in standard catalog selectors
  const chapterLinkElements = $(
    '#list dd a, .dir-list a, .chapter-list a, .section-list a, ul.cf li a, #chapterlist a, .mulu-list a, .read-list a, dl dd a'
  );

  chapterLinkElements.each((index, el) => {
    const $el = $(el);
    const linkText = $el.text().trim();
    const href = $el.attr('href');

    if (!href || href.startsWith('javascript:') || href === '#') return;
    if (!linkText || linkText.length < 2) return;

    try {
      const absoluteUrl = new URL(href, finalUrl).toString();
      if (!seenUrls.has(absoluteUrl)) {
        seenUrls.add(absoluteUrl);
        chapters.push({
          title: linkText,
          url: absoluteUrl,
          index: chapters.length + 1,
        });
      }
    } catch {
      // Ignore invalid URL
    }
  });

  return {
    type: 'novel',
    title: title || 'Tiểu Thuyết Chưa Đặt Tên',
    originalTitleZh: title || '未命名小说',
    author: author || 'Khuyết danh',
    description: description || 'Chưa có lời giới thiệu.',
    coverUrl,
    sourceUrl: normalizedUrl,
    sourceDomain: parsedUrl.hostname,
    chapters: chapters.slice(0, 100), // Max first 100 chapters in initial overview
  };
}
