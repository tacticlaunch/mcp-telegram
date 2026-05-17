import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Behavioural hints surfaced to the MCP client.
 * - `readOnlyHint`    : tool only reads state
 * - `destructiveHint` : tool may permanently destroy data
 * - `idempotentHint`  : repeating the call is safe
 * - `openWorldHint`   : tool touches external services / non-local state
 */
type Annotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export const ANN: Record<string, Annotations> = {
  // ── auth / account
  listAccounts: { readOnlyHint: true },
  login: { openWorldHint: true },
  logout: { destructiveHint: true, openWorldHint: true },
  getMe: { readOnlyHint: true, openWorldHint: true },
  // ── self profile
  updateProfile: { idempotentHint: true, openWorldHint: true },
  updateMyUsername: { idempotentHint: true, openWorldHint: true },
  setBirthday: { idempotentHint: true, openWorldHint: true },
  setProfilePhoto: { idempotentHint: true, openWorldHint: true },
  // ── dialogs / discovery
  listDialogs: { readOnlyHint: true, openWorldHint: true },
  searchDialogs: { readOnlyHint: true, openWorldHint: true },
  resolveUsername: { readOnlyHint: true, openWorldHint: true },
  listFolders: { readOnlyHint: true, openWorldHint: true },
  // ── messages read
  listMessages: { readOnlyHint: true, openWorldHint: true },
  searchMessages: { readOnlyHint: true, openWorldHint: true },
  searchGlobal: { readOnlyHint: true, openWorldHint: true },
  getMessage: { readOnlyHint: true, openWorldHint: true },
  markAsRead: { idempotentHint: true, openWorldHint: true },
  // ── messages write
  sendMessage: { openWorldHint: true },
  editMessage: { idempotentHint: true, openWorldHint: true },
  deleteMessages: { destructiveHint: true, openWorldHint: true },
  forwardMessages: { openWorldHint: true },
  pinMessage: { idempotentHint: true, openWorldHint: true },
  unpinMessage: { idempotentHint: true, openWorldHint: true },
  sendMessageToPhone: { openWorldHint: true },
  // ── media
  sendFile: { openWorldHint: true },
  downloadMedia: { readOnlyHint: true, openWorldHint: true },
  downloadProfilePhoto: { readOnlyHint: true, openWorldHint: true },
  transcribeMessage: { readOnlyHint: true, openWorldHint: true },
  // ── reactions
  sendReaction: { idempotentHint: true, openWorldHint: true },
  getMessageReactions: { readOnlyHint: true, openWorldHint: true },
  setDefaultReaction: { idempotentHint: true, openWorldHint: true },
  // ── polls
  sendPoll: { openWorldHint: true },
  votePoll: { openWorldHint: true },
  closePoll: { idempotentHint: true, openWorldHint: true },
  getPollResults: { readOnlyHint: true, openWorldHint: true },
  // ── stories
  listStories: { readOnlyHint: true, openWorldHint: true },
  getPeerStories: { readOnlyHint: true, openWorldHint: true },
  sendStory: { openWorldHint: true },
  deleteStory: { destructiveHint: true, openWorldHint: true },
  viewStory: { idempotentHint: true, openWorldHint: true },
  getStoryViewers: { readOnlyHint: true, openWorldHint: true },
  // ── channel/group moderation
  banUser: { destructiveHint: true, openWorldHint: true },
  unbanUser: { idempotentHint: true, openWorldHint: true },
  restrictUser: { destructiveHint: true, openWorldHint: true },
  promoteAdmin: { idempotentHint: true, openWorldHint: true },
  demoteAdmin: { idempotentHint: true, openWorldHint: true },
  inviteUser: { idempotentHint: true, openWorldHint: true },
  getParticipant: { readOnlyHint: true, openWorldHint: true },
  listParticipants: { readOnlyHint: true, openWorldHint: true },
  deleteUserHistory: { destructiveHint: true, openWorldHint: true },
  kickParticipant: { destructiveHint: true, openWorldHint: true },
  getAdminLog: { readOnlyHint: true, openWorldHint: true },
  // ── channel/group settings
  editTitle: { idempotentHint: true, openWorldHint: true },
  editAbout: { idempotentHint: true, openWorldHint: true },
  editPhoto: { idempotentHint: true, openWorldHint: true },
  updateUsername: { idempotentHint: true, openWorldHint: true },
  checkUsername: { readOnlyHint: true, openWorldHint: true },
  setSlowMode: { idempotentHint: true, openWorldHint: true },
  toggleSignatures: { idempotentHint: true, openWorldHint: true },
  togglePreHistoryHidden: { idempotentHint: true, openWorldHint: true },
  toggleJoinRequest: { idempotentHint: true, openWorldHint: true },
  leaveChannel: { destructiveHint: true, openWorldHint: true },
  getChannelInfo: { readOnlyHint: true, openWorldHint: true },
  getUserInfo: { readOnlyHint: true, openWorldHint: true },
  // ── channel/group lifecycle
  createChannel: { openWorldHint: true },
  deleteChannel: { destructiveHint: true, openWorldHint: true },
  migrateChat: { destructiveHint: true, openWorldHint: true },
  transferOwnership: { destructiveHint: true, openWorldHint: true },
  // ── invites
  createInviteLink: { openWorldHint: true },
  listInviteLinks: { readOnlyHint: true, openWorldHint: true },
  revokeInviteLink: { destructiveHint: true, openWorldHint: true },
  listInviteJoiners: { readOnlyHint: true, openWorldHint: true },
  // ── forum topics
  listTopics: { readOnlyHint: true, openWorldHint: true },
  createTopic: { openWorldHint: true },
  editTopic: { idempotentHint: true, openWorldHint: true },
  // ── drafts
  saveDraft: { idempotentHint: true, openWorldHint: true },
  clearDraft: { idempotentHint: true, openWorldHint: true },
  listDrafts: { readOnlyHint: true, openWorldHint: true },
  // ── notifications
  mutePeer: { idempotentHint: true, openWorldHint: true },
  unmutePeer: { idempotentHint: true, openWorldHint: true },
  getNotifySettings: { readOnlyHint: true, openWorldHint: true },
  setNotifySettings: { idempotentHint: true, openWorldHint: true },
  // ── folders mgmt
  createFolder: { openWorldHint: true },
  editFolder: { idempotentHint: true, openWorldHint: true },
  deleteFolder: { destructiveHint: true, openWorldHint: true },
  reorderFolders: { idempotentHint: true, openWorldHint: true },
  // ── contacts
  listContacts: { readOnlyHint: true, openWorldHint: true },
  addContact: { idempotentHint: true, openWorldHint: true },
  deleteContact: { destructiveHint: true, openWorldHint: true },
  searchContacts: { readOnlyHint: true, openWorldHint: true },
  // ── privacy / blocking
  blockUser: { idempotentHint: true, openWorldHint: true },
  unblockUser: { idempotentHint: true, openWorldHint: true },
  listBlocked: { readOnlyHint: true, openWorldHint: true },
  getPrivacy: { readOnlyHint: true, openWorldHint: true },
  setPrivacy: { idempotentHint: true, openWorldHint: true },
  // ── stickers
  getMyStickers: { readOnlyHint: true, openWorldHint: true },
  installStickerSet: { idempotentHint: true, openWorldHint: true },
  addRecentSticker: { idempotentHint: true, openWorldHint: true },
  // ── boosts
  getMyBoosts: { readOnlyHint: true, openWorldHint: true },
  applyBoost: { openWorldHint: true },
  // ── bots & raw bridge
  getInlineBotResults: { readOnlyHint: true, openWorldHint: true },
  invokeMtproto: { destructiveHint: true, openWorldHint: true },
};

// ─── env gates ───────────────────────────────────────────────────────

function isReadonly(): boolean {
  const v = (process.env.MCP_TELEGRAM_READONLY ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

interface ToolSelector {
  explicit: Set<string>;
  prefixes: string[];
}

function parseToolList(env: string | undefined): ToolSelector | null {
  if (!env || !env.trim()) return null;
  const explicit = new Set<string>();
  const prefixes: string[] = [];
  for (const raw of env.split(',')) {
    const t = raw.trim();
    if (!t) continue;
    if (t.endsWith('*')) prefixes.push(t.slice(0, -1));
    else explicit.add(t);
  }
  return { explicit, prefixes };
}

function selectorMatches(name: string, s: ToolSelector): boolean {
  if (s.explicit.has(name)) return true;
  return s.prefixes.some((p) => name.startsWith(p));
}

// ─── context passed to each tool module ──────────────────────────────

export interface ToolContext {
  /** Register a non-mutating tool. */
  reg: (name: string, config: any, handler: any) => void;
  /** Register a destructive tool. Silently skipped in read-only mode. */
  regWrite: (name: string, config: any, handler: any) => void;
}

export function buildContext(server: McpServer): ToolContext {
  const readonly = isReadonly();
  const allow = parseToolList(process.env.MCP_TELEGRAM_TOOLS);
  const deny = parseToolList(process.env.MCP_TELEGRAM_DISABLE);

  const isEnabled = (name: string): boolean => {
    if (allow && !selectorMatches(name, allow)) return false;
    if (deny && selectorMatches(name, deny)) return false;
    return true;
  };

  return {
    reg(name, config, handler) {
      if (!isEnabled(name)) return;
      server.registerTool(name, { ...config, annotations: ANN[name] }, handler);
    },
    regWrite(name, config, handler) {
      if (readonly) return;
      if (!isEnabled(name)) return;
      server.registerTool(name, { ...config, annotations: ANN[name] }, handler);
    },
  };
}
