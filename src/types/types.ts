export type ValidationResult<T> = {
  value: T;
  errors: string[];
};

export type ItemAttributes = Record<string, unknown>;

export type NormalizedItem<TAttributes extends ItemAttributes> = {
  id: string;
  type: string;
  title: string;
  sourceUrl?: string;
  tags: string[];
  attributes: TAttributes;
};

export type ItemTypeDefinition<TAttributes extends ItemAttributes> = {
  type: string;
  schema: FieldDefinition[];
  normalize(attributes: ItemAttributes): ValidationResult<NormalizedPayload<TAttributes>>;
  renderContext(attributes: NormalizedPayload<TAttributes>): RenderContext;
  renderMarkdown(attributes: NormalizedPayload<TAttributes>): string;
  renderRssItem(attributes: NormalizedPayload<TAttributes>): RssItem;
};

export type FieldDefinition = {
  name: string;
  required?: boolean;
  type: "string" | "url" | "string[]";
  maxLength?: number;
};

export type NormalizedPayload<TAttributes extends ItemAttributes> = {
  attributes: TAttributes;
  title: string;
  sourceUrl?: string;
  tags: string[];
};

export type RenderContext = {
  title: string;
  sourceUrl?: string;
  tags: string[];
  attributes: ItemAttributes;
};

export type RssItem = {
  id: string;
  title: string;
  url: string;
  summary?: string;
  publishedAt: Date;
};
