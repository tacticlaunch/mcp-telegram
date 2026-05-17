/**
 * Install / uninstall the `telegram` agent-skill bundle for the agent
 * clients the user has on this machine.
 *
 * Skill layout is the universal SKILL.md format used by Claude Code,
 * Codex CLI, Gemini CLI, Cline, and friends. For Cursor we generate a
 * `.mdc` adapter into the project's `.cursor/rules` since Cursor uses
 * a different frontmatter (globs / alwaysApply / description).
 */
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';

const SKILL_NAME = 'telegram';

/** Resolve the skills/ directory shipped with the npm package. */
function skillSourceDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/cli-install.js  →  <pkgRoot>/skills/telegram
  const candidates = [
    join(here, '..', 'skills', SKILL_NAME),
    join(here, '..', '..', 'skills', SKILL_NAME),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(
    `Skill source not found. Expected at one of:\n  ${candidates.join('\n  ')}`
  );
}

interface ClientTarget {
  /** Short id used on the CLI (`mcp-tg install <id>`). */
  id: string;
  /** Human-readable name for messages. */
  label: string;
  /** Where to write the skill. `null` if the client isn't installed. */
  dest: string | null;
  /** A heuristic path whose existence implies the client is installed. */
  detectPath: string;
  /** Layout to write at `dest`:
   *  - `'skill'`  : copy `skills/telegram/` verbatim (Claude Code, Codex CLI)
   *  - `'cursor'` : wrap as a Cursor plugin (`.cursor-plugin/plugin.json` +
   *                 `skills/telegram/`), Cursor's native plugin format.
   */
  layout: 'skill' | 'cursor';
}

function detectAll(): ClientTarget[] {
  const home = homedir();
  const claudeBase = join(home, '.claude');
  const codexBase = join(home, '.agents');
  const cursorBase = join(home, '.cursor');

  return [
    {
      id: 'claude',
      label: 'Claude Code',
      detectPath: claudeBase,
      // Skills go under ~/.claude/skills/<name>
      dest: join(claudeBase, 'skills', SKILL_NAME),
      layout: 'skill',
    },
    {
      id: 'codex',
      label: 'Codex CLI',
      detectPath: codexBase,
      // Codex skills dir per the Agent Skills spec is ~/.agents/skills/<name>
      dest: join(codexBase, 'skills', SKILL_NAME),
      layout: 'skill',
    },
    {
      id: 'cursor',
      label: 'Cursor',
      // Cursor's native plugin system: https://cursor.com/docs/plugins
      // Local plugins live under ~/.cursor/plugins/local/<name> and may
      // bundle skills/, rules/, mcp.json, etc.
      detectPath: cursorBase,
      dest: join(cursorBase, 'plugins', 'local', SKILL_NAME),
      layout: 'cursor',
    },
  ];
}

function copyDir(src: string, dst: string): number {
  mkdirSync(dst, { recursive: true });
  let count = 0;
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dst, entry);
    if (statSync(s).isDirectory()) {
      count += copyDir(s, d);
    } else {
      writeFileSync(d, readFileSync(s));
      count++;
    }
  }
  return count;
}

/**
 * Read a SKILL.md, extract YAML frontmatter, return body + (name, description).
 */
function readSkillMd(path: string): { name: string; description: string; body: string } {
  const raw = readFileSync(path, 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!m) return { name: SKILL_NAME, description: '', body: raw };
  const fm: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const eq = line.indexOf(':');
    if (eq === -1) continue;
    fm[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return {
    name: fm.name || SKILL_NAME,
    description: fm.description || '',
    body: m[2].trim(),
  };
}

function writeCursorPlugin(dest: string, src: string): number {
  // Cursor's native plugin layout (https://cursor.com/docs/plugins):
  //   <plugin-root>/
  //   ├── .cursor-plugin/plugin.json   (manifest, only `name` required)
  //   ├── skills/<skill>/SKILL.md       (universal SKILL.md format)
  //   └── mcp.json                      (optional MCP wiring)
  //
  // We bundle the skill verbatim plus an mcp.json that points to the same
  // npm package — so users get both the lazy-loaded skill and the option
  // to enable the MCP server inside Cursor without extra config.
  mkdirSync(dest, { recursive: true });
  mkdirSync(join(dest, '.cursor-plugin'), { recursive: true });
  const manifest = {
    name: SKILL_NAME,
    version: '1.0.0',
    description:
      'Operate a real Telegram user account from Cursor — read dialogs, search globally, send/edit/react, tag Saved Messages, moderate channels. Ships as a lazy-loaded agent skill plus an optional MCP server.',
  };
  writeFileSync(
    join(dest, '.cursor-plugin', 'plugin.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
  const mcpJson = {
    mcpServers: {
      [SKILL_NAME]: {
        command: 'npx',
        args: ['-y', 'mcp-telegram'],
      },
    },
  };
  writeFileSync(join(dest, 'mcp.json'), JSON.stringify(mcpJson, null, 2) + '\n');
  // Skill bundle goes under skills/<name>/ inside the plugin root.
  const skillDest = join(dest, 'skills', SKILL_NAME);
  const n = copyDir(src, skillDest);
  return n + 2; // +manifest +mcp.json
}

function isInstalledAt(t: ClientTarget): boolean {
  if (!t.dest) return false;
  if (t.layout === 'cursor') return existsSync(join(t.dest, '.cursor-plugin', 'plugin.json'));
  return existsSync(join(t.dest, 'SKILL.md'));
}

export async function runInstall(target?: string): Promise<void> {
  const src = skillSourceDir();
  const all = detectAll();
  const selected: ClientTarget[] =
    !target || target === 'all' ? all : all.filter((c) => c.id === target);

  if (selected.length === 0) {
    process.stderr.write(
      JSON.stringify({
        ok: false,
        error: `Unknown target '${target}'. Valid: ${all.map((c) => c.id).join(', ')}, all.`,
      }) + '\n'
    );
    process.exit(1);
  }

  const report: any[] = [];
  for (const t of selected) {
    // Skip silently when targeting "all" and the client isn't installed —
    // but always run when targeted explicitly so the user can pre-create
    // the directory by installing the client later.
    if (!target && !existsSync(t.detectPath)) {
      report.push({ client: t.id, status: 'skipped', reason: `not detected at ${t.detectPath}` });
      continue;
    }
    try {
      if (existsSync(t.dest!)) rmSync(t.dest!, { recursive: true, force: true });
      const n = t.layout === 'cursor' ? writeCursorPlugin(t.dest!, src) : copyDir(src, t.dest!);
      report.push({ client: t.id, status: 'installed', dest: t.dest, files: n, layout: t.layout });
    } catch (err) {
      report.push({ client: t.id, status: 'error', error: (err as Error).message });
    }
  }
  process.stdout.write(JSON.stringify({ ok: true, installed: report }, null, 2) + '\n');
}

export async function runUninstall(target?: string): Promise<void> {
  const all = detectAll();
  const selected: ClientTarget[] =
    !target || target === 'all' ? all : all.filter((c) => c.id === target);
  const report: any[] = [];
  for (const t of selected) {
    if (t.dest && existsSync(t.dest)) {
      rmSync(t.dest, { recursive: true, force: true });
      report.push({ client: t.id, status: 'removed', path: t.dest });
    } else {
      report.push({ client: t.id, status: 'absent' });
    }
  }
  process.stdout.write(JSON.stringify({ ok: true, removed: report }, null, 2) + '\n');
}

export async function runDoctor(): Promise<void> {
  const all = detectAll();
  const out = all.map((t) => ({
    client: t.id,
    label: t.label,
    detected: existsSync(t.detectPath),
    detectPath: t.detectPath,
    dest: t.dest,
    layout: t.layout,
    installed: isInstalledAt(t),
  }));
  process.stdout.write(JSON.stringify({ ok: true, clients: out }, null, 2) + '\n');
}

function detectedSummary(all: ClientTarget[]): string {
  return all
    .map((t) => `${t.id}=${existsSync(t.detectPath) ? 'yes' : 'no'}`)
    .join(', ');
}
