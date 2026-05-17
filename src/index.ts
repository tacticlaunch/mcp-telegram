#!/usr/bin/env node

import { config as dotenvConfig } from 'dotenv';

import { start } from './server.js';
import { logger } from './logger.js';

dotenvConfig();

process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', reason as Error);
});

start().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
