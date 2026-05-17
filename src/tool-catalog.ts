/**
 * Static catalog of every tool the server can register, grouped for
 * display in the settings UI. Order here drives the order in the
 * sidebar / accordion on the auth page.
 *
 * Mirror of the per-area files under src/tools/. When a tool is added
 * or removed there, update this file too — the catalog is the only
 * source the settings UI has into which tools exist (the MCP server
 * itself doesn't expose tool names until after init).
 */
export interface ToolEntry {
  name: string;
  desc: string;
  /** True for tools that mutate state — used by the settings UI to
   *  grey them out when read-only mode is on. Mirrors the regWrite
   *  registrations under src/tools/. */
  mutating?: boolean;
}
export interface ToolGroup {
  id: string;
  title: string;
  tools: ToolEntry[];
}

export const TOOL_CATALOG: ToolGroup[] = [
  {
    id: 'sessions',
    title: 'Sessions (local)',
    tools: [
      { name: 'listAccounts', desc: 'List signed-in accounts' },
      { name: 'login', desc: 'Sign in to a new account' },
      { name: 'logout', desc: 'Drop a session', mutating: true },
      { name: 'openSettings', desc: 'Open this settings page' },
    ],
  },
  {
    id: 'profile',
    title: 'Profile',
    tools: [
      { name: 'getMe', desc: 'Current user profile' },
      { name: 'updateProfile', desc: 'Edit own name / bio', mutating: true },
      { name: 'updateMyUsername', desc: 'Edit own @username', mutating: true },
      { name: 'setBirthday', desc: 'Set birthday on profile', mutating: true },
      { name: 'setProfilePhoto', desc: 'Change own avatar', mutating: true },
    ],
  },
  {
    id: 'discovery',
    title: 'Dialog discovery',
    tools: [
      { name: 'listDialogs', desc: 'List dialogs/chats/channels' },
      { name: 'searchDialogs', desc: 'Find dialogs by substring' },
      { name: 'resolveUsername', desc: 'Resolve @username' },
      { name: 'listFolders', desc: 'List custom folders' },
    ],
  },
  {
    id: 'messages-read',
    title: 'Messages — read',
    tools: [
      { name: 'listMessages', desc: 'List messages in a dialog' },
      { name: 'searchMessages', desc: 'Search inside one dialog' },
      { name: 'searchGlobal', desc: 'Search across all dialogs' },
      { name: 'getMessage', desc: 'Fetch by id' },
      { name: 'getMessageReactions', desc: 'Reactions on messages' },
      { name: 'markAsRead', desc: 'Mark dialog read', mutating: true },
    ],
  },
  {
    id: 'messages-write',
    title: 'Messages — write',
    tools: [
      { name: 'sendMessage', desc: 'Send text', mutating: true },
      { name: 'editMessage', desc: 'Edit text', mutating: true },
      { name: 'deleteMessages', desc: 'Delete by id', mutating: true },
      { name: 'forwardMessages', desc: 'Forward between dialogs', mutating: true },
      { name: 'pinMessage', desc: 'Pin', mutating: true },
      { name: 'unpinMessage', desc: 'Unpin', mutating: true },
      { name: 'sendReaction', desc: 'React to a message', mutating: true },
      { name: 'setDefaultReaction', desc: 'Default quick reaction', mutating: true },
      { name: 'sendMessageToPhone', desc: 'Send to phone (auto-contact)', mutating: true },
    ],
  },
  {
    id: 'media',
    title: 'Media',
    tools: [
      { name: 'sendFile', desc: 'Send file (path/URL/album)', mutating: true },
      { name: 'downloadMedia', desc: 'Download attached media' },
      { name: 'downloadProfilePhoto', desc: 'Download avatar' },
      { name: 'transcribeMessage', desc: 'Transcribe voice (Premium)' },
    ],
  },
  {
    id: 'polls',
    title: 'Polls',
    tools: [
      { name: 'sendPoll', desc: 'Send poll / quiz', mutating: true },
      { name: 'votePoll', desc: 'Cast a vote', mutating: true },
      { name: 'closePoll', desc: 'Finalize poll', mutating: true },
      { name: 'getPollResults', desc: 'Vote tally' },
    ],
  },
  {
    id: 'stories',
    title: 'Stories',
    tools: [
      { name: 'listStories', desc: 'Feed of contacts’ stories' },
      { name: 'getPeerStories', desc: 'One peer’s stories' },
      { name: 'sendStory', desc: 'Post a story', mutating: true },
      { name: 'deleteStory', desc: 'Delete a story', mutating: true },
      { name: 'viewStory', desc: 'Mark stories viewed', mutating: true },
      { name: 'getStoryViewers', desc: 'List viewers' },
    ],
  },
  {
    id: 'moderation',
    title: 'Channel / group moderation',
    tools: [
      { name: 'banUser', desc: 'Full ban', mutating: true },
      { name: 'unbanUser', desc: 'Lift restrictions', mutating: true },
      { name: 'restrictUser', desc: 'Custom rights mask', mutating: true },
      { name: 'promoteAdmin', desc: 'Grant admin rights', mutating: true },
      { name: 'demoteAdmin', desc: 'Strip admin rights', mutating: true },
      { name: 'inviteUser', desc: 'Add to channel', mutating: true },
      { name: 'kickParticipant', desc: 'Remove from chat', mutating: true },
      { name: 'getParticipant', desc: 'Single participant info' },
      { name: 'listParticipants', desc: 'Members with filters' },
      { name: 'deleteUserHistory', desc: 'Wipe user’s messages', mutating: true },
      { name: 'getAdminLog', desc: 'Admin event log' },
    ],
  },
  {
    id: 'channel-settings',
    title: 'Channel / group settings',
    tools: [
      { name: 'editTitle', desc: 'Title', mutating: true },
      { name: 'editAbout', desc: 'Description', mutating: true },
      { name: 'editPhoto', desc: 'Avatar (path/URL)', mutating: true },
      { name: 'updateUsername', desc: 'Public @username', mutating: true },
      { name: 'checkUsername', desc: 'Username availability' },
      { name: 'setSlowMode', desc: 'Slow-mode seconds', mutating: true },
      { name: 'toggleSignatures', desc: 'Author signatures', mutating: true },
      { name: 'togglePreHistoryHidden', desc: 'Hide history', mutating: true },
      { name: 'toggleJoinRequest', desc: 'Approve to join', mutating: true },
      { name: 'leaveChannel', desc: 'Leave', mutating: true },
      { name: 'getChannelInfo', desc: 'Extended channel info' },
      { name: 'getUserInfo', desc: 'Extended user info' },
    ],
  },
  {
    id: 'channel-lifecycle',
    title: 'Channel / group lifecycle',
    tools: [
      { name: 'createChannel', desc: 'New channel / supergroup', mutating: true },
      { name: 'deleteChannel', desc: 'Permanently delete', mutating: true },
      { name: 'migrateChat', desc: 'Basic group → supergroup', mutating: true },
      { name: 'transferOwnership', desc: 'Hand over creator', mutating: true },
    ],
  },
  {
    id: 'invites',
    title: 'Invite links',
    tools: [
      { name: 'createInviteLink', desc: 'New link', mutating: true },
      { name: 'listInviteLinks', desc: 'List links' },
      { name: 'revokeInviteLink', desc: 'Revoke a link', mutating: true },
      { name: 'listInviteJoiners', desc: 'Who joined via a link' },
    ],
  },
  {
    id: 'topics',
    title: 'Forum topics',
    tools: [
      { name: 'listTopics', desc: 'List topics' },
      { name: 'createTopic', desc: 'New topic', mutating: true },
      { name: 'editTopic', desc: 'Rename / close / hide', mutating: true },
    ],
  },
  {
    id: 'drafts',
    title: 'Drafts',
    tools: [
      { name: 'saveDraft', desc: 'Save a draft', mutating: true },
      { name: 'clearDraft', desc: 'Clear a draft', mutating: true },
      { name: 'listDrafts', desc: 'All drafts' },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    tools: [
      { name: 'mutePeer', desc: 'Mute', mutating: true },
      { name: 'unmutePeer', desc: 'Unmute', mutating: true },
      { name: 'getNotifySettings', desc: 'Read settings' },
      { name: 'setNotifySettings', desc: 'Update settings', mutating: true },
    ],
  },
  {
    id: 'folders',
    title: 'Folders (chat filters)',
    tools: [
      { name: 'createFolder', desc: 'New folder', mutating: true },
      { name: 'editFolder', desc: 'Edit folder', mutating: true },
      { name: 'deleteFolder', desc: 'Delete folder', mutating: true },
      { name: 'reorderFolders', desc: 'Reorder folders', mutating: true },
    ],
  },
  {
    id: 'contacts',
    title: 'Contacts',
    tools: [
      { name: 'listContacts', desc: 'List contacts' },
      { name: 'addContact', desc: 'Add', mutating: true },
      { name: 'deleteContact', desc: 'Delete', mutating: true },
      { name: 'searchContacts', desc: 'Search directory' },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy & blocking',
    tools: [
      { name: 'blockUser', desc: 'Block', mutating: true },
      { name: 'unblockUser', desc: 'Unblock', mutating: true },
      { name: 'listBlocked', desc: 'Block list' },
      { name: 'getPrivacy', desc: 'Read a privacy key' },
      { name: 'setPrivacy', desc: 'Update a privacy key', mutating: true },
    ],
  },
  {
    id: 'stickers',
    title: 'Stickers',
    tools: [
      { name: 'getMyStickers', desc: 'Installed sets' },
      { name: 'installStickerSet', desc: 'Install set', mutating: true },
      { name: 'addRecentSticker', desc: 'Pin to recent', mutating: true },
    ],
  },
  {
    id: 'boosts',
    title: 'Premium boosts',
    tools: [
      { name: 'getMyBoosts', desc: 'Own boost slots' },
      { name: 'applyBoost', desc: 'Apply to a channel', mutating: true },
    ],
  },
  {
    id: 'bots',
    title: 'Bots & raw bridge',
    tools: [
      { name: 'getInlineBotResults', desc: 'Inline bot query' },
      { name: 'invokeMtproto', desc: 'Raw MTProto method', mutating: true },
    ],
  },
];

export function allToolNames(): string[] {
  const out: string[] = [];
  for (const g of TOOL_CATALOG) for (const t of g.tools) out.push(t.name);
  return out;
}
