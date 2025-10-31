import { loadConfig } from "@app/lib/config";

export type AssetUrls = {
  og: string;
  embed: string;
  markdown: string;
};

function toPublicPath(
  folder: string,
  type: string,
  id: string,
  ext: string,
): string {
  return `/${folder}/${type}/${id}.${ext}`;
}

export function buildAssetUrls(type: string, id: string): AssetUrls {
  const config = loadConfig();
  const basePath = config.basePath ?? "";

  const withBase = (path: string) => {
    if (!basePath) return path;
    return `${basePath}${path}`;
  };

  const baseOg = toPublicPath("og", type, id, "jpg");
  const baseEmbed = toPublicPath("embed", type, id, "html");
  const baseMarkdown = toPublicPath("markdown", type, id, "md");

  const ogWithVersion = config.cardVersion
    ? `${baseOg}?v=${config.cardVersion}`
    : baseOg;

  const relative: AssetUrls = {
    og: withBase(ogWithVersion),
    embed: withBase(baseEmbed),
    markdown: withBase(baseMarkdown),
  };

  if (!config.siteOrigin) {
    return relative;
  }

  const origin = config.siteOrigin.replace(/\/$/, "");
  return {
    og: `${origin}${relative.og}`,
    embed: `${origin}${relative.embed}`,
    markdown: `${origin}${relative.markdown}`,
  };
}
