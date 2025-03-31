import server from './../mcp.js';
import { Tool } from "fastmcp";
import bigInt from "big-integer";
import { z } from 'zod';

import { createClient } from '../lib/telegram.js';
import { logger } from '../utils/logger.js';


/**
 * Schema for ListMessages parameters
 */
export const ListMessagesParamsSchema = z.object({
  dialogId: z.string().describe('ID of the dialog to list messages from'),
  unread: z.boolean().optional().describe('Show only unread messages'),
  limit: z.number().optional().describe('Maximum number of messages to retrieve')
});

/**
 * List Messages Tool - Get messages from a specific dialog
 */
export const listMessagesTool: Tool<undefined, typeof ListMessagesParamsSchema> = {
  name: "listMessages",
  description: "List messages in a given dialog, chat or channel. The messages are listed in order from newest to oldest.",
  parameters: ListMessagesParamsSchema,
  execute: async (args, {log}) => {
    logger.info("Retrieving messages", args);
    
    const response: object[] = [];
    const client = await createClient();
    
    try {
      // Convert dialogId to BigInteger
      const dialogId = bigInt(args.dialogId);
      
      // Get dialog to check unread count
      // const dialogs = await client.getDialogs();
      // const dialog = dialogs.find(d => d.id && d.id.eq(dialogId));
      
      // if (!dialog) {
      //   logger.error(`Dialog not found: ${validArgs.dialogId}`);
      //   throw new Error(`Dialog not found: ${validArgs.dialogId}`);
      // }
      
      // Determine limit
      // const limit = validArgs.unread 
      //   ? Math.min(dialog.unreadCount || 0, validArgs.limit || 100)
      //   : validArgs.limit || 100;
      
      // logger.debug(`Retrieving up to ${limit} messages from dialog ${dialog.title}`);
      
      // Get messages
      const messages = await client.getMessages(dialogId, {
        limit: 10
      });
      
      log.debug(`Retrieved ${messages.length} messages`);
      
      for (const message of messages) {
        response.push(message);
      }
      
      return JSON.stringify(response);
    } catch (error) {
      log.error('Error listing messages:', (error as Error).message);
      throw error;
    }
  }
}; 