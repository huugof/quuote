import {
  getRenderer,
  type RenderInput,
  type RenderResult,
} from "@app/render/registry";

// Register built-in renderers
import "@app/render/quote";

export async function renderItem<T>(
  type: string,
  input: RenderInput<T>,
): Promise<RenderResult> {
  const renderer = getRenderer(type);
  return await renderer(input);
}
