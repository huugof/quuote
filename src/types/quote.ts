import type {
  FieldDefinition,
  ItemAttributes,
  ItemTypeDefinition,
  NormalizedPayload,
  ValidationResult,
} from "@app/types/types";

export type QuoteAttributes = {
  quote_text: string;
  author?: string;
  url: string;
  article_title?: string;
  tags?: string[];
  body?: string;
};

const schema: FieldDefinition[] = [
  { name: "quote_text", type: "string", required: true, maxLength: 1000 },
  { name: "author", type: "string", required: false, maxLength: 200 },
  { name: "url", type: "url", required: true },
  { name: "article_title", type: "string", required: false, maxLength: 200 },
  { name: "tags", type: "string[]", required: false },
  { name: "body", type: "string", required: false, maxLength: 2000 },
];

function normalize(
  attributes: ItemAttributes,
): ValidationResult<NormalizedPayload<QuoteAttributes>> {
  const errors: string[] = [];
  const result: QuoteAttributes = {
    quote_text: "",
    url: "",
  };

  for (const field of schema) {
    const value = attributes[field.name];
    if (
      field.required &&
      (value === undefined || value === null || value === "")
    ) {
      errors.push(`Missing required field: ${field.name}`);
      continue;
    }

    if (value === undefined || value === null || value === "") continue;

    switch (field.type) {
      case "string": {
        if (typeof value !== "string") {
          errors.push(`Expected string for field: ${field.name}`);
          break;
        }
        if (field.maxLength && value.length > field.maxLength) {
          errors.push(
            `Field ${field.name} exceeds max length ${field.maxLength}`,
          );
        }
        (result as ItemAttributes)[field.name] = value.trim();
        break;
      }
      case "url": {
        if (typeof value !== "string") {
          errors.push(`Expected URL string for field: ${field.name}`);
          break;
        }
        try {
          const url = new URL(value);
          (result as ItemAttributes)[field.name] = url.toString();
        } catch {
          errors.push(`Invalid URL for field: ${field.name}`);
        }
        break;
      }
      case "string[]": {
        if (!Array.isArray(value)) {
          errors.push(`Expected string array for field: ${field.name}`);
          break;
        }
        const normalized = value
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter((entry) => entry.length > 0);
        (result as ItemAttributes)[field.name] = normalized;
        break;
      }
    }
  }

  const title = result.article_title ?? result.quote_text.slice(0, 120);
  const tags = Array.isArray(result.tags) ? result.tags : [];
  return {
    value: {
      attributes: result,
      title,
      sourceUrl: result.url,
      tags,
    },
    errors,
  };
}

function renderContext(payload: NormalizedPayload<QuoteAttributes>) {
  return {
    title: payload.title,
    sourceUrl: payload.sourceUrl,
    tags: payload.tags,
    attributes: payload.attributes,
  };
}

function renderMarkdown(payload: NormalizedPayload<QuoteAttributes>): string {
  const { attributes, tags } = payload;
  const frontMatter: Record<string, unknown> = {
    quote_text: attributes.quote_text,
    author: attributes.author,
    url: attributes.url,
    article_title: attributes.article_title,
    tags,
  };

  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(frontMatter)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      lines.push(
        `${key}: [${value.map((tag) => JSON.stringify(tag)).join(", ")}]`,
      );
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push("---\n");
  if (attributes.body) {
    lines.push(attributes.body);
  }
  return lines.join("\n");
}

function renderRssItem(payload: NormalizedPayload<QuoteAttributes>) {
  return {
    id: payload.attributes.url,
    title: payload.title,
    url: payload.attributes.url,
    summary: payload.attributes.quote_text,
    publishedAt: new Date(),
  };
}

const quoteDefinition: ItemTypeDefinition<QuoteAttributes> = {
  type: "quote",
  schema,
  normalize,
  renderContext,
  renderMarkdown,
  renderRssItem,
};

export default quoteDefinition;
