// Measure how many tokens the mcp-telegram tool catalog injects into an
// MCP client's context at startup. Captures every reg/regWrite call with
// a fake server, converts Zod input schemas to JSON-Schema (what the
// SDK actually serializes for tools/list), and counts characters + a
// rough token estimate (chars / 4 — close to GPT/Claude BPE average).

import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { encode as encodeGpt4o } from 'gpt-tokenizer/model/gpt-4o';

const captured = [];

// Fake McpServer that records what registerTool would have sent.
const fakeServer = {
  registerTool(name, config) {
    // Convert Zod object inputSchema → JSON Schema (MCP wire format).
    let inputSchema = {};
    if (config.inputSchema) {
      try {
        inputSchema = zodToJsonSchema(z.object(config.inputSchema), { target: 'openApi3' });
      } catch {
        inputSchema = { _raw: 'unconvertible' };
      }
    }
    captured.push({
      name,
      title: config.title,
      description: config.description,
      annotations: config.annotations,
      inputSchema,
    });
  },
};

const { buildContext } = await import('../dist/tools/_registry.js');
const ctx = buildContext(fakeServer);

const MODULES = [
  'accounts', 'profile', 'dialogs', 'messages-read', 'messages-write', 'saved',
  'media', 'reactions', 'polls', 'stories', 'moderation', 'channel-settings',
  'channel-lifecycle', 'invites', 'topics', 'drafts', 'notifications',
  'folders', 'contacts', 'privacy', 'stickers', 'boosts', 'bots', 'mtproto',
];

for (const m of MODULES) {
  const mod = await import(`../dist/tools/${m}.js`);
  mod.register(ctx);
}

// What the MCP client actually sees on tools/list — name, description,
// inputSchema, annotations. Title is usually included too.
const wire = captured.map((t) => ({
  name: t.name,
  title: t.title,
  description: t.description,
  inputSchema: t.inputSchema,
  annotations: t.annotations,
}));

const json = JSON.stringify(wire);
const pretty = JSON.stringify(wire, null, 2);

const chars = json.length;
const charsPretty = pretty.length;
const tokensReal = encodeGpt4o(json).length;
const tokensRealPretty = encodeGpt4o(pretty).length;

// Per-tool breakdown
const perTool = wire
  .map((t) => {
    const s = JSON.stringify(t);
    return { name: t.name, chars: s.length, tokens: encodeGpt4o(s).length };
  })
  .sort((a, b) => b.tokens - a.tokens);

console.log(`\n# mcp-telegram token footprint\n`);
console.log(`Tools registered: ${wire.length}`);
console.log(`Compact JSON   : ${chars.toLocaleString()} chars   ${tokensReal.toLocaleString()} tokens (gpt-4o BPE)`);
console.log(`Pretty JSON    : ${charsPretty.toLocaleString()} chars   ${tokensRealPretty.toLocaleString()} tokens`);
console.log(`Per-tool avg   : ${Math.round(tokensReal / wire.length)} tokens\n`);

console.log(`## Top 10 heaviest tools`);
for (const t of perTool.slice(0, 10)) {
  console.log(`  ${t.tokens.toString().padStart(5)} tok   ${t.name}`);
}

console.log(`\n## Lightest 5`);
for (const t of perTool.slice(-5)) {
  console.log(`  ${t.tokens.toString().padStart(5)} tok   ${t.name}`);
}
