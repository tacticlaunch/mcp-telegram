#!/usr/bin/env node

import { Command } from 'commander';
import { config as dotenvConfig } from 'dotenv';
import { createInterface } from 'readline';

import { connectToTelegram, logoutFromTelegram } from './lib/index.js';
import { logger } from './utils/logger.js';
import { config } from './config.js';
import server, { startServer } from './mcp.js';
import pkg from '../package.json' with { type: 'json' };

// Load environment variables
dotenvConfig();

// Create CLI program
const program = new Command();

// Set basic CLI info
program
  .name('mcp-telegram')
  .description('Telegram MCP server - interact with Telegram via Model Context Protocol')
  .version(pkg.version);

// Command: sign-in
program
  .command('sign-in')
  .description('Sign in to Telegram')
  .action(async () => {
    logger.info('Starting Telegram sign-in process...');
    
    const apiId = config.telegram.apiId;
    const apiHash = config.telegram.apiHash;
    
    if (!apiId || !apiHash) {
      logger.error('TELEGRAM_API_ID and TELEGRAM_API_HASH environment variables must be set');
      process.exit(1);
    }
    
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const phoneNumber = await new Promise<string>(resolve => {
      rl.question('Enter your phone number (with country code): ', answer => {
        resolve(answer);
        rl.close();
      });
    });
    
    try {
      await connectToTelegram(apiId, apiHash, phoneNumber);
      logger.info('Sign-in successful!');
      process.exit(0);
    } catch (error) {
      logger.error('Failed to sign in:', error);
      process.exit(1);
    }
  });

// Command: mcp
program
  .command('mcp')
  .description('Start the MCP server')
  .option('-t, --transport <type>', 'Transport type (stdio, sse)', 'stdio')
  .option('-p, --port <number>', 'Port for HTTP/SSE transport', '3000')
  .option('-e, --endpoint <path>', 'Endpoint for SSE transport', 'mcp')
  .action(async (options) => {
    // Override config with command line options
    if (options.transport) {
      config.server.transportType = options.transport;
    }
    if (options.port) {
      config.server.port = parseInt(options.port, 10);
    }
    if (options.endpoint) {
      config.server.endpoint = options.endpoint;
    }
    
    logger.info(`Starting MCP server with ${config.server.transportType} transport...`);
    
    // Set up graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Server shutting down (SIGINT)');
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      logger.info('Server shutting down (SIGTERM)');
      process.exit(0);
    });
    
    // Start the server
    startServer(server);
  });

// Command: logout
program
  .command('logout')
  .description('Logout from Telegram')
  .action(async () => {
    logger.info('Logging out from Telegram...');
    
    try {
      await logoutFromTelegram();
      logger.info('Logout successful!');
    } catch (error) {
      logger.error('Failed to logout:', error);
      process.exit(1);
    }
  });

// Default command - display help
program
  .action(() => {
    program.help();
  });

// Process CLI arguments
program.parse(process.argv); 