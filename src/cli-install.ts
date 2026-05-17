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
  /** If true, write as Cursor `.mdc` adapter instead of copying SKILL.md verbatim. */
  cursor?: boolean;
}

function detectAll(): ClientTarget[] {
  const home = homedir();
  const claudeBase = join(home, '.claude');
  const codexBase = join(home, '.agents');
  const cursorProjBase = join(process.cwd(), '.cursor', 'rules');

  return [
    {
      id: 'claude',
      label: 'Claude Code',
      detectPath: claudeBase,
      dest: existsSync(claudeBase) ? join(claudeBase, 'skills', SKILL_NAME) : null,
    },
    {
      id: 'codex',
      label: 'Codex CLI',
      detectPath: codexBase,
      // Codex skills dir per the spec is ~/.agents/skills/<name>
      dest: existsSync(codexBase) ? join(codexBase, 'skills', SKILL_NAME) : join(codexBase, 'skills', SKILL_NAME),
    },
    {
      id: 'cursor',
      label: 'Cursor (project rules)',
      detectPath: join(process.cwd(), '.cursor'),
      // For Cursor we always target the current project — global rules
      // aren't a stable concept yet.
      dest: cursorProjBase,
      cursor: true,
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

function writeCursorAdapter(dest: string, src: string): void {
  mkdirSync(dest, { recursive: true });
  const skill = readSkillMd(join(src, 'SKILL.md'));
  // Cursor's frontmatter uses different keys; description-only rules
  // activate when the agent decides they're relevant (Agent Requested
  // mode). globs left empty, alwaysApply: false → fully lazy.
  const mdc =
    `---\n` +
    `description: ${skill.description}\n` +
    `globs: \n` +
    `alwaysApply: false\n` +
    `---\n\n` +
    skill.body +
    '\n\n' +
    `(Reference files live in your package install; consult mcp-telegram repo for full recipes.)\n`;
  writeFileSync(join(dest, `${skill.name}.mdc`), mdc);
}

export async function runInstall(target?: string): Promise<void> {
  const src = skillSourceDir();
  const all = detectAll();
  const selected: ClientTarget[] =
    !target || target === 'all'
      ? all.filter((c) => c.dest !== null || c.id === 'codex') // codex dir created on demand
      : all.filter((c) => c.id === target);

  if (selected.length === 0) {
    process.stderr.write(
      JSON.stringify({
        ok: false,
        error: `No target client matched. Detected: ${detectedSummary(all)}`,
      }) + '\n'
    );
    process.exit(1);
  }

  const report: any[] = [];
  for (const t of selected) {
    if (!t.dest) {
      report.push({ client: t.id, status: 'skipped', reason: `not detected at ${t.detectPath}` });
      continue;
    }
    try {
      if (t.cursor) {
        writeCursorAdapter(t.dest, src);
        report.push({ client: t.id, status: 'installed', dest: t.dest, mode: 'mdc adapter' });
      } else {
        // Clean previous install to avoid stale files.
        if (existsSync(t.dest)) rmSync(t.dest, { recursive: true, force: true });
        const n = copyDir(src, t.dest);
        report.push({ client: t.id, status: 'installed', dest: t.dest, files: n });
      }
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
    if (t.cursor) {
      const mdc = join(t.dest!, `${SKILL_NAME}.mdc`);
      if (existsSync(mdc)) {
        rmSync(mdc, { force: true });
        report.push({ client: t.id, status: 'removed', path: mdc });
      } else {
        report.push({ client: t.id, status: 'absent' });
      }
      continue;
    }
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
    installed: t.cursor
      ? t.dest
        ? existsSync(join(t.dest, `${SKILL_NAME}.mdc`))
        : false
      : t.dest
        ? existsSync(t.dest)
        : false,
  }));
  process.stdout.write(JSON.stringify({ ok: true, clients: out }, null, 2) + '\n');
}

function detectedSummary(all: ClientTarget[]): string {
  return all
    .map((t) => `${t.id}=${existsSync(t.detectPath) ? 'yes' : 'no'}`)
    .join(', ');
}
