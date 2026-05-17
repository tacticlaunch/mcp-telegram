import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { buildContext } from './_registry.js';
import * as accounts from './accounts.js';
import * as profile from './profile.js';
import * as dialogs from './dialogs.js';
import * as messagesRead from './messages-read.js';
import * as messagesWrite from './messages-write.js';
import * as saved from './saved.js';
import * as media from './media.js';
import * as reactions from './reactions.js';
import * as polls from './polls.js';
import * as stories from './stories.js';
import * as moderation from './moderation.js';
import * as channelSettings from './channel-settings.js';
import * as channelLifecycle from './channel-lifecycle.js';
import * as invites from './invites.js';
import * as topics from './topics.js';
import * as drafts from './drafts.js';
import * as notifications from './notifications.js';
import * as folders from './folders.js';
import * as contacts from './contacts.js';
import * as privacy from './privacy.js';
import * as stickers from './stickers.js';
import * as boosts from './boosts.js';
import * as bots from './bots.js';
import * as mtproto from './mtproto.js';

const MODULES = [
  accounts,
  profile,
  dialogs,
  messagesRead,
  messagesWrite,
  saved,
  media,
  reactions,
  polls,
  stories,
  moderation,
  channelSettings,
  channelLifecycle,
  invites,
  topics,
  drafts,
  notifications,
  folders,
  contacts,
  privacy,
  stickers,
  boosts,
  bots,
  mtproto,
];

export function registerTools(server: McpServer): void {
  const ctx = buildContext(server);
  for (const m of MODULES) m.register(ctx);
}
