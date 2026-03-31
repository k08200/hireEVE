/**
 * News — RSS feed parser (completely free, no API key needed)
 *
 * Fetches news from multiple Korean and international RSS sources.
 */

interface NewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
}

const RSS_FEEDS: Record<string, string> = {
  // Korean
  조선일보: "https://www.chosun.com/arc/outboundfeeds/rss/?outputType=xml",
  한겨레: "https://www.hani.co.kr/rss/",
  연합뉴스: "https://www.yna.co.kr/rss/news.xml",
  // Tech
  TechCrunch: "https://techcrunch.com/feed/",
  "Hacker News": "https://hnrss.org/frontpage",
  "The Verge": "https://www.theverge.com/rss/index.xml",
  // Business
  Reuters: "https://www.reutersagency.com/feed/",
};

function parseRssItems(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];

  // Match <item>...</item> blocks
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match = itemRegex.exec(xml);

  while (match !== null && items.length < 10) {
    const block = match[1];

    const title = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]>|<title>([\s\S]*?)<\/title>/);
    const link = block.match(/<link>([\s\S]*?)<\/link>/);
    const desc = block.match(
      /<description><!\[CDATA\[([\s\S]*?)\]\]>|<description>([\s\S]*?)<\/description>/,
    );
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

    const titleText = (title?.[1] || title?.[2] || "").trim().replace(/<[^>]+>/g, "");
    const linkText = (link?.[1] || "").trim();
    const descText = (desc?.[1] || desc?.[2] || "")
      .trim()
      .replace(/<[^>]+>/g, "")
      .slice(0, 200);
    const dateText = (pubDate?.[1] || "").trim();

    if (titleText && linkText) {
      items.push({
        title: titleText,
        link: linkText,
        description: descText,
        pubDate: dateText,
        source,
      });
    }

    match = itemRegex.exec(xml);
  }

  // Also try Atom <entry> format
  if (items.length === 0) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    match = entryRegex.exec(xml);

    while (match !== null && items.length < 10) {
      const block = match[1];
      const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/);
      const link = block.match(/<link[^>]*href="([^"]+)"/);
      const summary = block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
      const updated = block.match(/<updated>([\s\S]*?)<\/updated>/);

      const titleText = (title?.[1] || "").trim().replace(/<[^>]+>/g, "");
      const linkText = (link?.[1] || "").trim();

      if (titleText && linkText) {
        items.push({
          title: titleText,
          link: linkText,
          description: (summary?.[1] || "")
            .trim()
            .replace(/<[^>]+>/g, "")
            .slice(0, 200),
          pubDate: (updated?.[1] || "").trim(),
          source,
        });
      }

      match = entryRegex.exec(xml);
    }
  }

  return items;
}

export async function getNews(
  topic?: string,
  sources?: string[],
): Promise<{ news: NewsItem[]; totalSources: number }> {
  const feedNames = sources?.length
    ? sources.filter((s) => s in RSS_FEEDS)
    : Object.keys(RSS_FEEDS);

  const allItems: NewsItem[] = [];
  let successCount = 0;

  const results = await Promise.allSettled(
    feedNames.map(async (name) => {
      const url = RSS_FEEDS[name];
      const res = await fetch(url, {
        headers: { "User-Agent": "EVE-News-Bot/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      const xml = await res.text();
      return parseRssItems(xml, name);
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      allItems.push(...result.value);
      successCount++;
    }
  }

  // Sort by date (newest first)
  allItems.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });

  // Filter by topic if provided
  let filtered = allItems;
  if (topic) {
    const lower = topic.toLowerCase();
    filtered = allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(lower) || item.description.toLowerCase().includes(lower),
    );
  }

  return { news: filtered.slice(0, 15), totalSources: successCount };
}

export const NEWS_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_news",
      description:
        "Get latest news from multiple sources (Korean and international). Can filter by topic. Sources include 조선일보, 한겨레, 연합뉴스, TechCrunch, Hacker News, The Verge, Reuters.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: "Optional topic to filter news (e.g. 'AI', '경제', 'startup')",
          },
          sources: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional list of source names to fetch from. Available: 조선일보, 한겨레, 연합뉴스, TechCrunch, Hacker News, The Verge, Reuters",
          },
        },
        required: [],
      },
    },
  },
];
