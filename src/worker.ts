import { setTimeout } from "node:timers/promises";

import { loadConfig } from "@app/lib/config";
import { buildAssetUrls } from "@app/lib/assets";
import {
  ensureDataStructure,
  ensureTypeDirectories,
  writeFileEnsured,
} from "@app/lib/fs";
import {
  buildAssetPaths,
  markRenderFailure,
  markRenderResult,
  takeNextQueuedItem,
} from "@app/lib/items-repo";
import { logger } from "@app/lib/logger";
import { runMigrations } from "@app/lib/migrate";
import { regenerateFeedsForType } from "@app/lib/rss";
import { renderItem } from "@app/render/index";
import { getType } from "@app/types/index";
import type { NormalizedPayload } from "@app/types/types";

const config = loadConfig();

await runMigrations();
await ensureDataStructure(config.dataRoot);

logger.info("worker_started", { dataRoot: config.dataRoot });

async function processQueuedItem() {
  const item = takeNextQueuedItem<any>();
  if (!item) {
    return false;
  }

  const definition = getType(item.type);
  const payload: NormalizedPayload<any> = {
    attributes: item.attributes,
    title: item.title ?? "",
    sourceUrl: item.sourceUrl ?? undefined,
    tags: item.tags,
  };
  const context = definition.renderContext(payload);
  const renderedAt = new Date();

  const assets = buildAssetPaths(item.type, item.id, config.dataRoot);
  const assetUrls = buildAssetUrls(item.type, item.id);
  await ensureTypeDirectories(config.dataRoot, item.type);

  try {
    const result = await renderItem(item.type, {
      id: item.id,
      payload,
      context,
      assets: assetUrls,
    });

    const markdown = definition.renderMarkdown(payload);

    await writeFileEnsured(assets.ogPath, result.og);
    await writeFileEnsured(assets.embedPath, result.embedHtml);
    await writeFileEnsured(assets.markdownPath, markdown);

    markRenderResult(item.id, {
      ogPath: assets.ogPath,
      embedPath: assets.embedPath,
      markdownPath: assets.markdownPath,
      renderedAt,
    });

    await regenerateFeedsForType(item.type);
    logger.info("render_complete", { id: item.id, type: item.type });
    return true;
  } catch (error) {
    markRenderFailure(item.id);
    logger.error("render_failed", {
      id: item.id,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return false;
  }
}

async function workLoop() {
  while (true) {
    try {
      const processed = await processQueuedItem();
      if (!processed) {
        await setTimeout(1_000);
      }
    } catch (error) {
      logger.error("worker_loop_error", { error });
      await setTimeout(1_000);
    }
  }
}

await workLoop();
