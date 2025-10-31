import type { AssetUrls } from "@app/lib/assets";
import type { NormalizedPayload, RenderContext } from "@app/types/types";

export type RenderInput<T> = {
  id: string;
  payload: NormalizedPayload<T>;
  context: RenderContext;
  assets: AssetUrls;
};

export type RenderResult = {
  og: Uint8Array;
  embedHtml: string;
};

type Renderer = (
  input: RenderInput<any>,
) => Promise<RenderResult> | RenderResult;

const renderers = new Map<string, Renderer>();

export function registerRenderer(type: string, renderer: Renderer) {
  if (renderers.has(type)) {
    throw new Error(`Renderer already registered for type: ${type}`);
  }
  renderers.set(type, renderer);
}

export function getRenderer(type: string): Renderer {
  const renderer = renderers.get(type);
  if (!renderer) {
    throw new Error(`No renderer registered for type: ${type}`);
  }
  return renderer;
}
