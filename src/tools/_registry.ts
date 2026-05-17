import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Behavioural hints surfaced to the MCP client.
 *
 * - `readOnlyHint`    : tool only reads state
 * - `destructiveHint` : tool may permanently destroy data
 * - `idempotentHint`  : repeating the call is safe
 * - `openWorldHint`   : tool touches external services / non-local state
 *
 * `reg()` / `regWrite()` apply a sensible default per call, and the
 * tool definition can override via `annotations`:
 *
 *   ctx.regWrite('deleteMessages', {
 *     title, description, inputSchema,
 *     annotations: { destructiveHint: true, openWorldHint: true },
 *   }, handler);
 */
type Annotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

/** Default for `reg()` — non-mutating, talks to Telegram. */
const DEFAULT_READ: Annotations = { readOnlyHint: true, openWorldHint: true };
/** Default for `regWrite()` — mutating, talks to Telegram. Not destructive unless overridden. */
const DEFAULT_WRITE: Annotations = { openWorldHint: true };

// ─── env gates ───────────────────────────────────────────────────────

function isReadonly(): boolean {
  const v = (process.env.MCP_TELEGRAM_READONLY ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

interface ToolSelector {
  explicit: Set<string>;
  prefixes: string[];
}

function parseToolList(env: string | undefined): ToolSelector | null {
  if (!env || !env.trim()) return null;
  const explicit = new Set<string>();
  const prefixes: string[] = [];
  for (const raw of env.split(',')) {
    const t = raw.trim();
    if (!t) continue;
    if (t.endsWith('*')) prefixes.push(t.slice(0, -1));
    else explicit.add(t);
  }
  return { explicit, prefixes };
}

function selectorMatches(name: string, s: ToolSelector): boolean {
  if (s.explicit.has(name)) return true;
  return s.prefixes.some((p) => name.startsWith(p));
}

// ─── context passed to each tool module ──────────────────────────────

interface ToolConfig {
  title?: string;
  description?: string;
  inputSchema?: any;
  annotations?: Annotations;
}

export interface ToolContext {
  /** Register a non-mutating tool. Default annotations: read-only + open-world. */
  reg: (name: string, config: ToolConfig, handler: any) => void;
  /** Register a destructive tool — silently skipped in read-only mode. Default annotations: open-world. */
  regWrite: (name: string, config: ToolConfig, handler: any) => void;
}

export function buildContext(server: McpServer): ToolContext {
  const readonly = isReadonly();
  const allow = parseToolList(process.env.MCP_TELEGRAM_TOOLS);
  const deny = parseToolList(process.env.MCP_TELEGRAM_DISABLE);

  const isEnabled = (name: string): boolean => {
    if (allow && !selectorMatches(name, allow)) return false;
    if (deny && selectorMatches(name, deny)) return false;
    return true;
  };

  return {
    reg(name, config, handler) {
      if (!isEnabled(name)) return;
      const annotations = config.annotations ?? DEFAULT_READ;
      server.registerTool(name, { ...config, annotations } as any, handler);
    },
    regWrite(name, config, handler) {
      if (readonly) return;
      if (!isEnabled(name)) return;
      const annotations = config.annotations ?? DEFAULT_WRITE;
      server.registerTool(name, { ...config, annotations } as any, handler);
    },
  };
}
