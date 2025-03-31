import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

/**
 * Configuration settings for the MCP Telegram server
 */
export const config = {
  server: {
    transportType: process.env.TRANSPORT_TYPE || 'stdio',
    port: parseInt(process.env.PORT || '3000', 10),
    endpoint: process.env.ENDPOINT || 'mcp'
  },
  telegram: {
    apiId: process.env.TELEGRAM_API_ID,
    apiHash: process.env.TELEGRAM_API_HASH
  },
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
}; 