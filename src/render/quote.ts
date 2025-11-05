import { Resvg } from "@resvg/resvg-js";
import { encode as encodeJpeg } from "jpeg-js";
import satori from "satori";

import { escapeHtml } from "@app/lib/html";
import type { RenderInput } from "@app/render/registry";
import { registerRenderer } from "@app/render/registry";
import { loadFonts } from "@app/render/fonts";
import type { QuoteAttributes } from "@app/types/quote";

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 628;
const CARD_PADDING_X = 150;
const CARD_PADDING_Y = 120;
const QUOTE_FONT_MAX = 72;
const QUOTE_FONT_MIN = 36;
const QUOTE_LINE_HEIGHT = 1.32;
const SPACE_WIDTH_RATIO = 0.35;
const CHAR_WIDTH_RATIO = 0.6;
const WIDE_CHAR_BONUS_RATIO = 0.08;
const JPEG_QUALITY = 88;

registerRenderer("quote", async (input) => {
  const og = await renderOgImage(input);
  const embedHtml = buildEmbedHtml(input);
  return { og, embedHtml };
});

async function renderOgImage(
  input: RenderInput<QuoteAttributes>,
): Promise<Uint8Array> {
  const quote = input.payload.attributes.quote_text ?? "";
  const fonts = await loadFonts();
  const quoteFontSize = calculateQuoteFontSize(quote);

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          display: "flex",
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          background: "#f7f4ec",
          color: "#26211a",
          padding: `${CARD_PADDING_Y}px ${CARD_PADDING_X}px`,
          boxSizing: "border-box",
          fontFamily: "Atkinson Hyperlegible",
          alignItems: "center",
          justifyContent: "center",
        },
        children: [
          {
            type: "div",
            props: {
              style: {
                fontSize: quoteFontSize,
                lineHeight: QUOTE_LINE_HEIGHT,
                fontWeight: 400,
                textAlign: "center",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxWidth: "100%",
              },
              children: `“${quote}”`,
            },
          },
        ],
      },
    },
    {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fonts,
    },
  );

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: CARD_WIDTH },
  });

  const rendered = resvg.render();
  const jpeg = encodeJpeg(
    { data: rendered.pixels, width: rendered.width, height: rendered.height },
    JPEG_QUALITY,
  );
  return Uint8Array.from(jpeg.data);
}

function buildEmbedHtml(input: RenderInput<QuoteAttributes>): string {
  const {
    payload: {
      attributes: {
        quote_text: quoteText = "",
        author,
        article_title: articleTitle,
        body,
      },
      sourceUrl,
    },
    assets,
  } = input;

  const authorName = author?.trim() || "";
  const domain = sourceUrl ? safeHostname(sourceUrl) : "";
  const description = buildDescription(authorName, articleTitle, domain);
  const pageTitle = articleTitle || domain || "Quote";
  const quoteContent = escapeHtml(quoteText);
  const authorContent = authorName ? escapeHtml(authorName) : "";
  const articleLink = articleTitle ? escapeHtml(articleTitle) : "";
  const sourceHref = sourceUrl ? escapeHtml(sourceUrl) : "#";
  const ogImage = escapeHtml(assets.og);
  const embedLink = escapeHtml(assets.embed);
  const markdownLink = escapeHtml(assets.markdown);

  const bodyHtml = body ? `<p>${escapeHtml(body)}</p>` : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:url" content="${embedLink}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${ogImage}" />
    <link rel="canonical" href="${sourceHref}" />
    <style>
      :root { color-scheme: light; }
      body {
        font-family: "Atkinson Hyperlegible", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        max-width: 640px;
        margin: 4rem auto;
        padding: 0 1.5rem;
        line-height: 1.6;
        color: #1f2933;
        background: #ffffff;
      }
      blockquote {
        margin: 0 0 1.5rem;
        padding-left: 1rem;
        border-left: 4px solid #d1d5db;
        font-size: 1.2rem;
      }
      cite {
        display: block;
        font-style: normal;
        font-weight: 600;
        margin-top: 0.25rem;
      }
      .meta {
        font-size: 0.9rem;
        color: #52606d;
      }
      main {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      a {
        color: inherit;
        text-decoration: underline;
      }
      .note {
        margin-top: 2rem;
        font-size: 0.85rem;
        color: #7b8794;
      }
    </style>
  </head>
  <body>
    <main>
      <blockquote>“${quoteContent}”</blockquote>
      ${authorContent ? `<cite>${authorContent}</cite>` : ""}
      ${
        articleLink
          ? `<div class="meta">From <a href="${sourceHref}">${articleLink}</a></div>`
          : ""
      }
      ${bodyHtml}
      <div class="note">Read the full context on <a href="${sourceHref}">${sourceHref}</a>.</div>
      <div class="note"><a href="${markdownLink}">Download Markdown</a></div>
    </main>
  </body>
</html>`;
}

function calculateQuoteFontSize(text: string): number {
  const sanitized = (text || "").replace(/\s+/g, " ").trim();
  const availableWidth = CARD_WIDTH - CARD_PADDING_X * 2;
  const availableHeight = CARD_HEIGHT - CARD_PADDING_Y * 2;

  if (!sanitized) {
    return QUOTE_FONT_MAX;
  }

  for (let size = QUOTE_FONT_MAX; size >= QUOTE_FONT_MIN; size -= 2) {
    const lines = estimateLineCount(sanitized, size, availableWidth);
    const quoteHeight = lines * size * QUOTE_LINE_HEIGHT;

    if (quoteHeight <= availableHeight) {
      return size;
    }
  }

  return QUOTE_FONT_MIN;
}

function estimateLineCount(
  text: string,
  fontSize: number,
  maxWidth: number,
): number {
  const words = text.split(" ");
  if (!words.length) return 1;

  const spaceWidth = fontSize * SPACE_WIDTH_RATIO;
  let lineWidth = 0;
  let lines = 1;

  for (const word of words) {
    if (!word) continue;
    const measuredWordWidth = Math.min(
      estimateWordWidth(word, fontSize),
      maxWidth,
    );

    if (lineWidth === 0) {
      lineWidth = measuredWordWidth;
      continue;
    }

    if (lineWidth + spaceWidth + measuredWordWidth > maxWidth) {
      lines += 1;
      lineWidth = measuredWordWidth;
    } else {
      lineWidth += spaceWidth + measuredWordWidth;
    }
  }

  return lines;
}

function estimateWordWidth(word: string, fontSize: number): number {
  const length = word.length;
  if (!length) return 0;

  const wideCharacters = (word.match(/[MW@#&$%]/g) || []).length;
  const narrowCharacters = (word.match(/[il1']/g) || []).length;
  const baseWidth = length * CHAR_WIDTH_RATIO;
  const widthAdjust =
    wideCharacters * WIDE_CHAR_BONUS_RATIO - narrowCharacters * 0.04;
  const estimated = Math.max(0.4, baseWidth + widthAdjust);
  return estimated * fontSize;
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function buildDescription(
  author: string,
  articleTitle?: string,
  domain?: string,
): string {
  if (articleTitle) {
    if (author) return `From ${articleTitle} by ${author}`;
    if (domain) return `From ${articleTitle} on ${domain}`;
    return `From ${articleTitle}`;
  }
  if (author && domain) return `${author} on ${domain}`;
  if (author) return author;
  if (domain) return `Collected from ${domain}`;
  return "Collected quote";
}
