import { Tool } from 'fastmcp';
import { z } from 'zod';

import { createClient } from '../lib/telegram.js';
import { logger } from '../utils/logger.js';
import { asyncErrorHandler } from '../utils/errorHandler.js';

/**
 * Schema for ListDialogs parameters
 */
export const ListDialogsParamsSchema = z.object({
  unread: z.boolean().optional().describe('Show only unread dialogs'),
  archived: z.boolean().optional().describe('Include archived dialogs'),
  ignorePinned: z.boolean().optional().describe('Ignore pinned dialogs')
});

/**
 * List Dialogs Tool - Get list of available dialogs, chats and channels
 */
export const listDialogsTool: Tool<undefined, typeof ListDialogsParamsSchema> = {
  name: "listDialogs", 
  description: "List available dialogs, chats and channels.",
  parameters: ListDialogsParamsSchema,
  execute: async (args, {log}) => {
    logger.info("Retrieving dialogs", args);
    
    const validateResult = ListDialogsParamsSchema.safeParse(args);
    if (!validateResult.success) {
      throw new Error(`Invalid parameters for listDialogs: ${JSON.stringify(validateResult.error.format())}`);
    }
    
    const validArgs = validateResult.data;
    const response: object[] = [];
    const client = await createClient();
    
    try {
      
      const dialogs = await client.getDialogs({
        archived: validArgs.archived || false,
        ignorePinned: validArgs.ignorePinned || false,
        limit: 5,
      });
      
      log.debug(`Retrieved ${dialogs.length} dialogs`);
      
      for (const dialog of dialogs) {
        if (validArgs.unread && dialog.unreadCount === 0) {
          continue;
        }
        
        response.push({
          id: dialog.id,
          name: dialog.name,
          title: dialog.title,
          unreadCount: dialog.unreadCount,
          date: dialog.date,
          pinned: dialog.pinned,
          archived: dialog.folderId !== undefined,
        });
      }
      
      return JSON.stringify(response);
    } catch (error) {
      log.error('Error listing dialogs:', (error as Error).message);
      throw error;
    }
  }
};