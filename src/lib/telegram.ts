import { Api, TelegramClient } from 'telegram';
import { StoreSession } from 'telegram/sessions/index.js';
import { computeCheck } from 'telegram/Password.js'
import { createInterface } from 'readline';

import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export interface TelegramSettings {
  apiId: string;
  apiHash: string;
}

/**
 * Load Telegram settings from config
 */
export function loadTelegramSettings(): TelegramSettings {
  const apiId = config.telegram.apiId;
  const apiHash = config.telegram.apiHash;

  if (!apiId || !apiHash) {
    throw new Error('TELEGRAM_API_ID and TELEGRAM_API_HASH environment variables must be set');
  }

  return { apiId, apiHash };
}

/**
 * Connect to Telegram using the provided credentials
 */
export async function connectToTelegram(apiId: string, apiHash: string, phoneNumber: string): Promise<void> {
  const client = await createClient(apiId, apiHash);

  const result = await client.sendCode({
    apiId: parseInt(apiId, 10),
    apiHash,
  }, phoneNumber);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const phoneCode = await new Promise<string>((resolve) => {
    rl.question('Enter login code: ', (answer) => {
      resolve(answer);
      rl.close();
    });
  });

  try {
    await client.invoke(new Api.auth.SignIn({
      phoneNumber,
      phoneCodeHash: result.phoneCodeHash,
      phoneCode
    }));
  } catch (error) {
    if ((error as any).errorMessage === 'SESSION_PASSWORD_NEEDED') {
      const passSrpRes = await client.invoke(new Api.account.GetPassword());

      const password = await new Promise<string>((resolve) => {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout
        });
        rl.question('Enter 2FA password: ', (answer) => {
          resolve(answer);
          rl.close();
        });
      });

      const passSrpCheck = await computeCheck(passSrpRes, password)
      await client.invoke(new Api.auth.CheckPassword({
        password: passSrpCheck
      }));
    } else {
      throw error;
    }
  }

  const user = await client.getMe();
  if (user && user.username) {
    logger.info(`Hey ${user.username}! You are connected!`);
  } else {
    logger.info('Connected!');
  }
  logger.info('You can now use the mcp-telegram server.');
}

/**
 * Logout from Telegram
 */
export async function logoutFromTelegram(): Promise<void> {
  const client = await createClient();
  await client.invoke(new Api.auth.LogOut());
  logger.info('You are now logged out from Telegram.');
}

// Cache for the client
let cachedClient: TelegramClient | null = null;

/**
 * Create a Telegram client
 */
export async function createClient(
  apiId?: string,
  apiHash?: string,
  sessionName = 'mcp_telegram_session'
): Promise<TelegramClient> {
  if (cachedClient) return cachedClient;

  let telegramConfig: TelegramSettings;
  if (apiId && apiHash) {
    telegramConfig = { apiId, apiHash };
  } else {
    telegramConfig = loadTelegramSettings();
  }

  const session = new StoreSession(sessionName);
  cachedClient = new TelegramClient(
    session,
    parseInt(telegramConfig.apiId, 10),
    telegramConfig.apiHash,
    {
      connectionRetries: 5,
      // baseLogger: logger
    }
  );
  await cachedClient.connect();

  return cachedClient;
}