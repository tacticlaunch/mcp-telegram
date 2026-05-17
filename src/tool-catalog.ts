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
}
export interface ToolGroup {
  id: string;
  title: string;
  tools: ToolEntry[];
}

export const TOOL_CATALOG: ToolGroup[] = [
  {
    id: 'accounts',
    title: 'Accounts & profile',
    tools: [
      { name: 'login', desc: 'Sign in to a new account' },
      { name: 'logout', desc: 'Drop a session' },
      { name: 'listAccounts', desc: 'List signed-in accounts' },
      { name: 'getMe', desc: 'Current user profile' },
      { name: 'openSettings', desc: 'Open this settings page' },
      { name: 'updateProfile', desc: 'Edit own name / bio' },
      { name: 'updateMyUsername', desc: 'Edit own @username' },
      { name: 'setBirthday', desc: 'Set birthday on profile' },
      { name: 'setProfilePhoto', desc: 'Change own avatar' },
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
      { name: 'markAsRead', desc: 'Mark dialog read' },
    ],
  },
  {
    id: 'messages-write',
    title: 'Messages — write',
    tools: [
      { name: 'sendMessage', desc: 'Send text' },
      { name: 'editMessage', desc: 'Edit text' },
      { name: 'deleteMessages', desc: 'Delete by id' },
      { name: 'forwardMessages', desc: 'Forward between dialogs' },
      { name: 'pinMessage', desc: 'Pin' },
      { name: 'unpinMessage', desc: 'Unpin' },
      { name: 'sendReaction', desc: 'React to a message' },
      { name: 'setDefaultReaction', desc: 'Default quick reaction' },
      { name: 'sendMessageToPhone', desc: 'Send to phone (auto-contact)' },
    ],
  },
  {
    id: 'media',
    title: 'Media',
    tools: [
      { name: 'sendFile', desc: 'Send file (path/URL/album)' },
      { name: 'downloadMedia', desc: 'Download attached media' },
      { name: 'downloadProfilePhoto', desc: 'Download avatar' },
      { name: 'transcribeMessage', desc: 'Transcribe voice (Premium)' },
    ],
  },
  {
    id: 'polls',
    title: 'Polls',
    tools: [
      { name: 'sendPoll', desc: 'Send poll / quiz' },
      { name: 'votePoll', desc: 'Cast a vote' },
      { name: 'closePoll', desc: 'Finalize poll' },
      { name: 'getPollResults', desc: 'Vote tally' },
    ],
  },
  {
    id: 'stories',
    title: 'Stories',
    tools: [
      { name: 'listStories', desc: 'Feed of contacts’ stories' },
      { name: 'getPeerStories', desc: 'One peer’s stories' },
      { name: 'sendStory', desc: 'Post a story' },
      { name: 'deleteStory', desc: 'Delete a story' },
      { name: 'viewStory', desc: 'Mark stories viewed' },
      { name: 'getStoryViewers', desc: 'List viewers' },
    ],
  },
  {
    id: 'moderation',
    title: 'Channel / group moderation',
    tools: [
      { name: 'banUser', desc: 'Full ban' },
      { name: 'unbanUser', desc: 'Lift restrictions' },
      { name: 'restrictUser', desc: 'Custom rights mask' },
      { name: 'promoteAdmin', desc: 'Grant admin rights' },
      { name: 'demoteAdmin', desc: 'Strip admin rights' },
      { name: 'inviteUser', desc: 'Add to channel' },
      { name: 'kickParticipant', desc: 'Remove from chat' },
      { name: 'getParticipant', desc: 'Single participant info' },
      { name: 'listParticipants', desc: 'Members with filters' },
      { name: 'deleteUserHistory', desc: 'Wipe user’s messages' },
      { name: 'getAdminLog', desc: 'Admin event log' },
    ],
  },
  {
    id: 'channel-settings',
    title: 'Channel / group settings',
    tools: [
      { name: 'editTitle', desc: 'Title' },
      { name: 'editAbout', desc: 'Description' },
      { name: 'editPhoto', desc: 'Avatar (path/URL)' },
      { name: 'updateUsername', desc: 'Public @username' },
      { name: 'checkUsername', desc: 'Username availability' },
      { name: 'setSlowMode', desc: 'Slow-mode seconds' },
      { name: 'toggleSignatures', desc: 'Author signatures' },
      { name: 'togglePreHistoryHidden', desc: 'Hide history' },
      { name: 'toggleJoinRequest', desc: 'Approve to join' },
      { name: 'leaveChannel', desc: 'Leave' },
      { name: 'getChannelInfo', desc: 'Extended channel info' },
      { name: 'getUserInfo', desc: 'Extended user info' },
    ],
  },
  {
    id: 'channel-lifecycle',
    title: 'Channel / group lifecycle',
    tools: [
      { name: 'createChannel', desc: 'New channel / supergroup' },
      { name: 'deleteChannel', desc: 'Permanently delete' },
      { name: 'migrateChat', desc: 'Basic group → supergroup' },
      { name: 'transferOwnership', desc: 'Hand over creator' },
    ],
  },
  {
    id: 'invites',
    title: 'Invite links',
    tools: [
      { name: 'createInviteLink', desc: 'New link' },
      { name: 'listInviteLinks', desc: 'List links' },
      { name: 'revokeInviteLink', desc: 'Revoke a link' },
      { name: 'listInviteJoiners', desc: 'Who joined via a link' },
    ],
  },
  {
    id: 'topics',
    title: 'Forum topics',
    tools: [
      { name: 'listTopics', desc: 'List topics' },
      { name: 'createTopic', desc: 'New topic' },
      { name: 'editTopic', desc: 'Rename / close / hide' },
    ],
  },
  {
    id: 'drafts',
    title: 'Drafts',
    tools: [
      { name: 'saveDraft', desc: 'Save a draft' },
      { name: 'clearDraft', desc: 'Clear a draft' },
      { name: 'listDrafts', desc: 'All drafts' },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    tools: [
      { name: 'mutePeer', desc: 'Mute' },
      { name: 'unmutePeer', desc: 'Unmute' },
      { name: 'getNotifySettings', desc: 'Read settings' },
      { name: 'setNotifySettings', desc: 'Update settings' },
    ],
  },
  {
    id: 'folders',
    title: 'Folders (chat filters)',
    tools: [
      { name: 'createFolder', desc: 'New folder' },
      { name: 'editFolder', desc: 'Edit folder' },
      { name: 'deleteFolder', desc: 'Delete folder' },
      { name: 'reorderFolders', desc: 'Reorder folders' },
    ],
  },
  {
    id: 'contacts',
    title: 'Contacts',
    tools: [
      { name: 'listContacts', desc: 'List contacts' },
      { name: 'addContact', desc: 'Add' },
      { name: 'deleteContact', desc: 'Delete' },
      { name: 'searchContacts', desc: 'Search directory' },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy & blocking',
    tools: [
      { name: 'blockUser', desc: 'Block' },
      { name: 'unblockUser', desc: 'Unblock' },
      { name: 'listBlocked', desc: 'Block list' },
      { name: 'getPrivacy', desc: 'Read a privacy key' },
      { name: 'setPrivacy', desc: 'Update a privacy key' },
    ],
  },
  {
    id: 'stickers',
    title: 'Stickers',
    tools: [
      { name: 'getMyStickers', desc: 'Installed sets' },
      { name: 'installStickerSet', desc: 'Install set' },
      { name: 'addRecentSticker', desc: 'Pin to recent' },
    ],
  },
  {
    id: 'boosts',
    title: 'Premium boosts',
    tools: [
      { name: 'getMyBoosts', desc: 'Own boost slots' },
      { name: 'applyBoost', desc: 'Apply to a channel' },
    ],
  },
  {
    id: 'bots',
    title: 'Bots & raw bridge',
    tools: [
      { name: 'getInlineBotResults', desc: 'Inline bot query' },
      { name: 'invokeMtproto', desc: 'Raw MTProto method' },
    ],
  },
];

export function allToolNames(): string[] {
  const out: string[] = [];
  for (const g of TOOL_CATALOG) for (const t of g.tools) out.push(t.name);
  return out;
}
