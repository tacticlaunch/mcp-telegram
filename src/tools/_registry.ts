import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getStoredSettings } from '../state.js';
import { REQUIRED_TOOLS } from '../tool-catalog.js';

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
 *   ctx.regWrite('delete_messages', {
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

// ─── env gates (env > state.json) ────────────────────────────────────

function isTruthy(v: string | undefined): boolean {
  const s = (v ?? '').toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

function effectiveReadonly(stored?: boolean): boolean {
  const env = process.env.MCP_TELEGRAM_READONLY;
  if (env !== undefined && env !== '') return isTruthy(env);
  return stored === true;
}

function effective(envName: string, stored?: string): string | undefined {
  const env = process.env[envName];
  if (env !== undefined && env !== '') return env;
  return stored;
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
  const stored = getStoredSettings();
  const readonly = effectiveReadonly(stored?.readonly);
  const allow = parseToolList(effective('MCP_TELEGRAM_TOOLS', stored?.tools));
  const deny = parseToolList(effective('MCP_TELEGRAM_DISABLE', stored?.disable));

  const isEnabled = (name: string): boolean => {
    // Required tools (listAccounts, login, logout, openSettings) are the
    // only way for the user to recover from a misconfigured allowlist
    // or rotate accounts. They bypass the env/state gates entirely.
    if (REQUIRED_TOOLS.has(name)) return true;
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
