export const EMBEDDED_TOOL_IDS = ["bookmarks"] as const;
export const BUILTIN_TOOL_IDS = ["bookmarks"] as const;

const embeddedToolIds = new Set<string>(EMBEDDED_TOOL_IDS);
const builtinToolIds = new Set<string>(BUILTIN_TOOL_IDS);

export function isEmbeddedToolId(toolId: string): boolean {
  return embeddedToolIds.has(toolId);
}

export function isBuiltinToolId(toolId: string): boolean {
  return builtinToolIds.has(toolId);
}
