/**
 * Rotating Proxy & Anti-Scraping Evasion Engine
 * Rotates proxies, user-agents, and HTTP headers continuously
 * to evade rate-limiting, IP bans, and regional geoblocking on Chinese novel websites.
 */

import iconv from 'iconv-lite';

export interface ProxyNode {
  id: string;
  name: string;
  type: 'direct' | 'cors_bridge' | 'custom_proxy';
  buildUrl: (targetUrl: string) => string;
  headers?: Record<string, string>;
  successCount: number;
  failureCount: number;
  lastUsedAt: number;
}

// Modern pool of authentic User-Agents across Android, iOS, Windows, and Mac
const USER_AGENTS = [
  // Mobile Android Chrome (Xiaomi, Huawei, Vivo, Oppo)
  'Mozilla/5.0 (Linux; Android 14; 23127PN0CG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.113 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.99 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; V2303A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.119 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; PGT-AN10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.178 Mobile Safari/537.36',
  // iOS Safari (iPhone 15 Pro, iPhone 14)
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  // Desktop Windows & Mac
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  // Chinese Search Engine Mobile & QQ/WeChat browser emulation (often whitelisted by novel sites)
  'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36 BaiduBoxApp/14.2.0.10',
  'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36 SogouSearch/10.9.1',
];

// Proxy nodes pool with rotating bridges and direct fetch
const PROXY_NODES: ProxyNode[] = [
  {
    id: 'direct-stealth',
    name: 'Direct Stealth (Chống chặn IP & X-Forwarded)',
    type: 'direct',
    buildUrl: (target) => target,
    successCount: 0,
    failureCount: 0,
    lastUsedAt: 0,
  },
  {
    id: 'cors-proxy-io',
    name: 'Proxy Gateway A (CORSProxy)',
    type: 'cors_bridge',
    buildUrl: (target) => `https://corsproxy.io/?url=${encodeURIComponent(target)}`,
    successCount: 0,
    failureCount: 0,
    lastUsedAt: 0,
  },
  {
    id: 'allorigins-win',
    name: 'Proxy Gateway B (AllOrigins Cloud)',
    type: 'cors_bridge',
    buildUrl: (target) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    successCount: 0,
    failureCount: 0,
    lastUsedAt: 0,
  },
  {
    id: 'codetabs-proxy',
    name: 'Proxy Gateway C (CodeTabs Bridge)',
    type: 'cors_bridge',
    buildUrl: (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    successCount: 0,
    failureCount: 0,
    lastUsedAt: 0,
  },
  {
    id: 'direct-baidu-agent',
    name: 'Direct Baidu Spider / QQ Mirror',
    type: 'direct',
    buildUrl: (target) => target,
    successCount: 0,
    failureCount: 0,
    lastUsedAt: 0,
  },
];

class ProxyRotatorService {
  private currentIndex = 0;
  private totalRotations = 0;

  /**
   * Generates randomized realistic request headers
   */
  private generateRandomHeaders(targetUrl: string, isBaiduUA: boolean = false): Record<string, string> {
    const urlObj = new URL(targetUrl);
    const randomUA = isBaiduUA
      ? 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36 BaiduBoxApp/14.2.0.10'
      : USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    // Generate random Chinese residential subnet IP for X-Forwarded-For
    const cnSubnets = ['183.14.', '113.88.', '116.24.', '220.181.', '121.35.', '119.147.'];
    const randomSubnet = cnSubnets[Math.floor(Math.random() * cnSubnets.length)];
    const fakeIp = `${randomSubnet}${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;

    const referers = [
      `https://www.baidu.com/s?wd=${encodeURIComponent(urlObj.hostname)}`,
      `https://m.baidu.com/`,
      `https://www.sogou.com/web?query=${encodeURIComponent(urlObj.hostname)}`,
      `${urlObj.protocol}//${urlObj.hostname}/`,
    ];
    const randomReferer = referers[Math.floor(Math.random() * referers.length)];

    return {
      'User-Agent': randomUA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,zh-TW;q=0.8,en-US;q=0.7,en;q=0.6',
      'Accept-Encoding': 'gzip, deflate',
      'Referer': randomReferer,
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-CH-UA-Mobile': randomUA.includes('Mobile') ? '?1' : '?0',
      'Sec-CH-UA-Platform': randomUA.includes('Android')
        ? '"Android"'
        : randomUA.includes('iPhone')
        ? '"iOS"'
        : randomUA.includes('Windows')
        ? '"Windows"'
        : '"macOS"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'cross-site',
      'X-Forwarded-For': fakeIp,
      'Client-IP': fakeIp,
      'X-Real-IP': fakeIp,
    };
  }

  /**
   * Fetches target URL using continuous proxy rotation with retry and failover
   */
  public async fetchWithRotation(targetUrl: string): Promise<{ html: string; finalUrl: string; proxyUsed: string }> {
    const attempts = PROXY_NODES.length;
    let lastError: any = null;

    // Start from current rotating index
    const startIndex = this.currentIndex;

    for (let attempt = 0; attempt < attempts; attempt++) {
      const nodeIndex = (startIndex + attempt) % PROXY_NODES.length;
      const node = PROXY_NODES[nodeIndex];
      this.totalRotations++;
      this.currentIndex = (nodeIndex + 1) % PROXY_NODES.length;

      const proxyFetchUrl = node.buildUrl(targetUrl);
      const isBaidu = node.id === 'direct-baidu-agent';
      const headers = this.generateRandomHeaders(targetUrl, isBaidu);

      console.log(`[ProxyRotator] (Vòng #${this.totalRotations}) Thử nghiệm ${node.name} -> ${targetUrl}`);

      const controller = new AbortController();
      const timeoutMs = node.type === 'direct' ? 9000 : 12000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(proxyFetchUrl, {
          signal: controller.signal,
          headers,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          // If 403 or 429 or 503, immediately mark failure and rotate to next proxy node
          node.failureCount++;
          console.warn(`[ProxyRotator] ${node.name} nhận mã lỗi HTTP ${response.status}. Tự động đổi proxy tiếp theo...`);
          lastError = new Error(`HTTP ${response.status} từ ${node.name}`);
          continue;
        }

        const contentType = response.headers.get('content-type') || '';
        const buffer = await response.arrayBuffer();
        const nodeBuffer = Buffer.from(buffer);

        // Encoding detection
        let encoding = 'utf-8';
        const headerMatch = contentType.match(/charset=([a-zA-Z0-9_-]+)/i);
        if (headerMatch) {
          encoding = headerMatch[1].toLowerCase();
        } else {
          const preview = nodeBuffer.subarray(0, 1024).toString('ascii');
          const metaMatch = preview.match(/<meta[^>]+charset=["']?([a-zA-Z0-9_-]+)/i);
          if (metaMatch) {
            encoding = metaMatch[1].toLowerCase();
          }
        }

        if (encoding.includes('gbk') || encoding.includes('gb2312')) {
          encoding = 'gbk';
        } else if (encoding.includes('big5')) {
          encoding = 'big5';
        } else {
          encoding = 'utf-8';
        }

        const html = iconv.decode(nodeBuffer, encoding);

        // Verify that the body is not a Cloudflare or WAF block page
        if (
          html.includes('Just a moment...') ||
          html.includes('cf-browser-verification') ||
          (html.includes('Attention Required! | Cloudflare') && html.length < 5000)
        ) {
          node.failureCount++;
          console.warn(`[ProxyRotator] ${node.name} gặp màn hình chặn Cloudflare. Tự động đổi proxy tiếp theo...`);
          lastError = new Error('Trang web bị chặn bởi Cloudflare WAF.');
          continue;
        }

        // If returned valid content
        if (html.length > 300) {
          node.successCount++;
          node.lastUsedAt = Date.now();
          console.log(`[ProxyRotator] Thành công tải trang (${html.length} bytes) qua: ${node.name}`);
          return {
            html,
            finalUrl: response.url || targetUrl,
            proxyUsed: node.name,
          };
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        node.failureCount++;
        lastError = err;
        console.warn(`[ProxyRotator] ${node.name} gặp lỗi (${err.message}). Đang chuyển proxy kế tiếp...`);
      }

      // Small jitter sleep before trying next proxy to avoid rate triggers
      await new Promise((r) => setTimeout(r, 150));
    }

    throw new Error(
      `Tất cả các cổng kết nối và proxy (${attempts} proxy) đều bị website chặn hoặc quá tải (${lastError?.message || 'Timeout'}). Bạn có thể chuyển sang tab "Nhập Trực Tiếp (Văn Bản Tiếng Trung)" để dán nội dung đọc ngay.`
    );
  }

  public getStats() {
    return {
      totalRotations: this.totalRotations,
      activeNodes: PROXY_NODES.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        successCount: n.successCount,
        failureCount: n.failureCount,
        lastUsedAt: n.lastUsedAt ? new Date(n.lastUsedAt).toLocaleTimeString() : 'Chưa dùng',
      })),
    };
  }
}

export const proxyRotator = new ProxyRotatorService();
