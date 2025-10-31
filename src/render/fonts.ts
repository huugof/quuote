import { join } from "node:path";

const FONT_DIR = join(process.cwd(), "assets", "fonts");

type SatoriFont = {
  name: string;
  data: ArrayBuffer;
  weight: number;
  style: "normal" | "italic";
};

let cachedFonts: SatoriFont[] | null = null;

export async function loadFonts(): Promise<SatoriFont[]> {
  if (cachedFonts) return cachedFonts;

  const regular = await Bun.file(
    join(FONT_DIR, "AtkinsonHyperlegible-Regular.ttf"),
  ).arrayBuffer();
  const bold = await Bun.file(
    join(FONT_DIR, "AtkinsonHyperlegible-Bold.ttf"),
  ).arrayBuffer();

  cachedFonts = [
    {
      name: "Atkinson Hyperlegible",
      data: regular,
      weight: 400,
      style: "normal",
    },
    { name: "Atkinson Hyperlegible", data: bold, weight: 700, style: "normal" },
  ];

  return cachedFonts;
}
