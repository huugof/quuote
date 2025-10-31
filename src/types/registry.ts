import type {
  ItemTypeDefinition,
  ItemAttributes,
  NormalizedPayload,
} from "@app/types/types";

const registry = new Map<string, ItemTypeDefinition<ItemAttributes>>();

export function registerType(definition: ItemTypeDefinition<ItemAttributes>) {
  if (registry.has(definition.type)) {
    throw new Error(`Type already registered: ${definition.type}`);
  }
  registry.set(definition.type, definition);
}

export function getType(type: string): ItemTypeDefinition<ItemAttributes> {
  const definition = registry.get(type);
  if (!definition) {
    throw new Error(`Unknown item type: ${type}`);
  }
  return definition;
}

export function listTypes(): ItemTypeDefinition<ItemAttributes>[] {
  return Array.from(registry.values());
}

export function normalizeAttributes<TAttributes extends ItemAttributes>(
  definition: ItemTypeDefinition<TAttributes>,
  attributes: ItemAttributes,
): { payload: NormalizedPayload<TAttributes>; errors: string[] } {
  const { value, errors } = definition.normalize(attributes);
  return { payload: value, errors };
}
