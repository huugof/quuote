import { join } from "node:path";

import { buildAssetUrls } from "@app/lib/assets";
import { loadConfig } from "@app/lib/config";
import { writeFileEnsured, ensureDataStructure } from "@app/lib/fs";
import { listRenderedItems } from "@app/lib/items-repo";
import { getType } from "@app/types/index";
import type { NormalizedPayload } from "@app/types/types";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function regenerateFeedsForType(type: string) {
  const config = loadConfig();
  await ensureDataStructure(config.dataRoot);

  const items = listRenderedItems<any>(type, 50);
  const definition = getType(type);

  const feedItems = items.map((item) => {
    const payload: NormalizedPayload<any> = {
      attributes: item.attributes,
      title: item.title ?? "",
      sourceUrl: item.sourceUrl ?? undefined,
      tags: item.tags,
    };
    const rss = definition.renderRssItem(payload);
    const assets = buildAssetUrls(item.type, item.id);
    const pubDate = (rss.publishedAt ?? new Date(item.renderedAt ?? item.updatedAt)).toUTCString();
    const summary = rss.summary ?? payload.attributes?.quote_text ?? "";
    return `    <item>
      <title>${escapeXml(rss.title)}</title>
      <link>${escapeXml(assets.embed)}</link>
      <guid isPermaLink="false">${escapeXml(`${item.type}:${item.id}`)}</guid>
      <description>${escapeXml(summary)}</description>
      <pubDate>${escapeXml(pubDate)}</pubDate>
    </item>`;
  });

  const siteOrigin = config.siteOrigin ?? "http://localhost";
  const basePath = config.basePath ?? "";
  const channelLink = `${siteOrigin}${basePath}/rss/${type}.xml`;
  const feedTitle = `Items (${type})`;

  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(feedTitle)}</title>
    <link>${escapeXml(channelLink)}</link>
    <description>${escapeXml(`Latest ${type} items`)}</description>
${feedItems.join("\n")}
  </channel>
</rss>
`;

  const feedPath = join(config.dataRoot, "rss", `${type}.xml`);
  await writeFileEnsured(feedPath, rssXml);
}
