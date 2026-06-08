const UA = "Mozilla/5.0 (compatible; VNStocks/1.0)";

export type RssItem = {
  title: string;
  summary: string;
  link: string;
  publishedAt: string;
  guid: string;
  publisher?: string;
};

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function stripHtmlToText(html: string): string {
  const decoded = decodeHtmlEntities(html);
  return decoded
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Google News RSS often embeds link + publisher inside HTML description. */
export function parseGoogleDescription(raw: string): {
  summary: string;
  link?: string;
  publisher?: string;
} {
  const decoded = decodeHtmlEntities(raw);
  const linkMatch = decoded.match(/href="([^"]+)"/i);
  const fontMatch = decoded.match(/<font[^>]*>([^<]+)<\/font>/i);
  const anchorMatch = decoded.match(/<a[^>]*>([^<]+)<\/a>/i);
  const plain = stripHtmlToText(raw);

  let summary = anchorMatch?.[1]?.trim() || plain;
  if (summary.length > 280) summary = `${summary.slice(0, 277)}…`;

  return {
    summary,
    link: linkMatch?.[1],
    publisher: fontMatch?.[1]?.trim(),
  };
}

function readTag(block: string, tag: string): string {
  const cdata = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i");
  const mCdata = block.match(cdata);
  if (mCdata) return mCdata[1].trim();

  const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(plain);
  return m ? m[1].trim() : "";
}

function normalizeItem(
  titleRaw: string,
  descriptionRaw: string,
  linkRaw: string,
  pubDate: string,
  guid: string,
): RssItem {
  const title = stripHtmlToText(titleRaw);
  const hasHtmlDesc = /&lt;|<a\s/i.test(descriptionRaw);
  const google = hasHtmlDesc ? parseGoogleDescription(descriptionRaw) : null;

  const summary = google?.summary || stripHtmlToText(descriptionRaw) || title;
  const link = linkRaw.trim() || google?.link || "";
  const publishedAt = pubDate
    ? new Date(pubDate).toISOString()
    : new Date().toISOString();

  return {
    title,
    summary: summary === title ? title : summary,
    link,
    publishedAt,
    guid: guid || link || title,
    publisher: google?.publisher,
  };
}

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const title = readTag(block, "title");
    if (!title) continue;
    items.push(
      normalizeItem(
        title,
        readTag(block, "description"),
        readTag(block, "link"),
        readTag(block, "pubDate"),
        readTag(block, "guid"),
      ),
    );
  }
  return items;
}

export async function fetchRss(url: string): Promise<RssItem[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml);
  } catch {
    return [];
  }
}

/** Yahoo Finance headline RSS for a VN ticker (e.g. FPT → FPT.VN). */
export function yahooHeadlineRssUrl(symbol: string): string {
  const sym = `${symbol.toUpperCase()}.VN`;
  return `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}&region=US&lang=en-US`;
}

/** Google News RSS — Vietnamese market headlines. */
export function googleMarketNewsRssUrl(): string {
  const q = encodeURIComponent("chứng khoán Việt Nam");
  return `https://news.google.com/rss/search?q=${q}&hl=vi&gl=VN&ceid=VN:vi`;
}

/** Google News RSS for a specific ticker mention. */
export function googleSymbolNewsRssUrl(symbol: string): string {
  const q = encodeURIComponent(`${symbol.toUpperCase()} cổ phiếu`);
  return `https://news.google.com/rss/search?q=${q}&hl=vi&gl=VN&ceid=VN:vi`;
}
