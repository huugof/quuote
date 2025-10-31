import type { ItemAttributes, ItemTypeDefinition } from "@app/types/types";
import { listTypes, getType, registerType } from "@app/types/registry";

// Register builtin types
import quoteDefinition from "@app/types/quote";

registerType(quoteDefinition as ItemTypeDefinition<ItemAttributes>);

export { listTypes, getType, registerType };
