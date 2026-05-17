#!/usr/bin/env node

import { config as dotenvConfig } from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { listAccounts } from './state.js';
import { runBrowserLogin } from './auth-browser.js';
import { registerTools } from './tools.js';
import { logger } from './logger.js';

dotenvConfig();

process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', reason as Error);
});

async function main(): Promise<void> {
  const server = new McpServer({ name: 'mcp-telegram', version: '1.0.0' });
  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('mcp-telegram (stdio) ready');

  if (listAccounts().length === 0) {
    logger.info('No Telegram accounts signed in — opening browser for first-run setup');
    runBrowserLogin().catch((err) => {
      logger.warn(`Auto-login flow ended without a session: ${(err as Error).message}`);
    });
  }
}

main().catch((err) => {
  logger.error('Fatal error in stdio entry', err);
  process.exit(1);
});
