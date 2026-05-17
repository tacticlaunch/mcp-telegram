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
  /** Tools that manage the install itself. Cannot be disabled by the
   *  allow/deny gates — otherwise the user could lock themselves out
   *  of adding/listing accounts or re-opening the settings page. */
  required?: boolean;
}

/** Names of always-on tools, derived from the catalog. */
export const REQUIRED_TOOLS = new Set<string>();
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
      { name: 'list_accounts', desc: 'List signed-in accounts', required: true },
      { name: 'login', desc: 'Sign in to a new account', required: true },
      { name: 'logout', desc: 'Drop a session', mutating: true, required: true },
      { name: 'open_settings', desc: 'Open this settings page', required: true },
    ],
  },
  {
    id: 'profile',
    title: 'Profile',
    tools: [
      { name: 'get_me', desc: 'Current user profile' },
      { name: 'update_profile', desc: 'Edit own name / bio', mutating: true },
      { name: 'update_my_username', desc: 'Edit own @username', mutating: true },
      { name: 'set_birthday', desc: 'Set birthday on profile', mutating: true },
      { name: 'set_profile_photo', desc: 'Change own avatar', mutating: true },
    ],
  },
  {
    id: 'discovery',
    title: 'Dialog discovery',
    tools: [
      { name: 'list_dialogs', desc: 'List dialogs/chats/channels' },
      { name: 'search_dialogs', desc: 'Find dialogs by substring' },
      { name: 'resolve_username', desc: 'Resolve @username' },
      { name: 'list_folders', desc: 'List custom folders' },
    ],
  },
  {
    id: 'messages-read',
    title: 'Messages — read',
    tools: [
      { name: 'list_messages', desc: 'List messages in a dialog' },
      { name: 'search_messages', desc: 'Search inside one dialog' },
      { name: 'search_global', desc: 'Search across all dialogs' },
      { name: 'get_message', desc: 'Fetch by id' },
      { name: 'get_message_reactions', desc: 'Reactions on messages' },
      { name: 'mark_as_read', desc: 'Mark dialog read', mutating: true },
    ],
  },
  {
    id: 'messages-write',
    title: 'Messages — write',
    tools: [
      { name: 'send_message', desc: 'Send text', mutating: true },
      { name: 'edit_message', desc: 'Edit text', mutating: true },
      { name: 'delete_messages', desc: 'Delete by id', mutating: true },
      { name: 'forward_messages', desc: 'Forward between dialogs', mutating: true },
      { name: 'pin_message', desc: 'Pin', mutating: true },
      { name: 'unpin_message', desc: 'Unpin', mutating: true },
      { name: 'send_reaction', desc: 'React to a message', mutating: true },
      { name: 'set_default_reaction', desc: 'Default quick reaction', mutating: true },
      { name: 'send_message_to_phone', desc: 'Send to phone (auto-contact)', mutating: true },
    ],
  },
  {
    id: 'saved',
    title: 'Saved Messages (tags)',
    tools: [
      { name: 'get_saved_reaction_tags', desc: 'List tag reactions (Premium)' },
      { name: 'update_saved_reaction_tag', desc: 'Rename a tag', mutating: true },
      { name: 'get_default_tag_reactions', desc: 'Suggested tag emojis' },
      { name: 'search_saved_messages', desc: 'Search Saved + filter by tag' },
      { name: 'get_saved_dialogs', desc: 'Saved sub-dialogs (per origin)' },
      { name: 'get_saved_history', desc: 'Messages in one saved sub-dialog' },
      { name: 'delete_saved_history', desc: 'Wipe a saved sub-dialog', mutating: true },
      { name: 'toggle_saved_dialog_pin', desc: 'Pin/unpin saved sub-dialog', mutating: true },
    ],
  },
  {
    id: 'media',
    title: 'Media',
    tools: [
      { name: 'send_file', desc: 'Send file (path/URL/album)', mutating: true },
      { name: 'download_media', desc: 'Download attached media' },
      { name: 'download_profile_photo', desc: 'Download avatar' },
      { name: 'transcribe_message', desc: 'Transcribe voice (Premium)' },
    ],
  },
  {
    id: 'polls',
    title: 'Polls',
    tools: [
      { name: 'send_poll', desc: 'Send poll / quiz', mutating: true },
      { name: 'vote_poll', desc: 'Cast a vote', mutating: true },
      { name: 'close_poll', desc: 'Finalize poll', mutating: true },
      { name: 'get_poll_results', desc: 'Vote tally' },
    ],
  },
  {
    id: 'stories',
    title: 'Stories',
    tools: [
      { name: 'list_stories', desc: 'Feed of contacts’ stories' },
      { name: 'get_peer_stories', desc: 'One peer’s stories' },
      { name: 'send_story', desc: 'Post a story', mutating: true },
      { name: 'delete_story', desc: 'Delete a story', mutating: true },
      { name: 'view_story', desc: 'Mark stories viewed', mutating: true },
      { name: 'get_story_viewers', desc: 'List viewers' },
    ],
  },
  {
    id: 'moderation',
    title: 'Channel / group moderation',
    tools: [
      { name: 'ban_user', desc: 'Full ban', mutating: true },
      { name: 'unban_user', desc: 'Lift restrictions', mutating: true },
      { name: 'restrict_user', desc: 'Custom rights mask', mutating: true },
      { name: 'promote_admin', desc: 'Grant admin rights', mutating: true },
      { name: 'demote_admin', desc: 'Strip admin rights', mutating: true },
      { name: 'invite_user', desc: 'Add to channel', mutating: true },
      { name: 'kick_participant', desc: 'Remove from chat', mutating: true },
      { name: 'get_participant', desc: 'Single participant info' },
      { name: 'list_participants', desc: 'Members with filters' },
      { name: 'delete_user_history', desc: 'Wipe user’s messages', mutating: true },
      { name: 'get_admin_log', desc: 'Admin event log' },
    ],
  },
  {
    id: 'channel-settings',
    title: 'Channel / group settings',
    tools: [
      { name: 'edit_title', desc: 'Title', mutating: true },
      { name: 'edit_about', desc: 'Description', mutating: true },
      { name: 'edit_photo', desc: 'Avatar (path/URL)', mutating: true },
      { name: 'update_username', desc: 'Public @username', mutating: true },
      { name: 'check_username', desc: 'Username availability' },
      { name: 'set_slow_mode', desc: 'Slow-mode seconds', mutating: true },
      { name: 'toggle_signatures', desc: 'Author signatures', mutating: true },
      { name: 'toggle_pre_history_hidden', desc: 'Hide history', mutating: true },
      { name: 'toggle_join_request', desc: 'Approve to join', mutating: true },
      { name: 'leave_channel', desc: 'Leave', mutating: true },
      { name: 'get_channel_info', desc: 'Extended channel info' },
      { name: 'get_user_info', desc: 'Extended user info' },
    ],
  },
  {
    id: 'channel-lifecycle',
    title: 'Channel / group lifecycle',
    tools: [
      { name: 'create_channel', desc: 'New channel / supergroup', mutating: true },
      { name: 'delete_channel', desc: 'Permanently delete', mutating: true },
      { name: 'migrate_chat', desc: 'Basic group → supergroup', mutating: true },
      { name: 'transfer_ownership', desc: 'Hand over creator', mutating: true },
    ],
  },
  {
    id: 'invites',
    title: 'Invite links',
    tools: [
      { name: 'create_invite_link', desc: 'New link', mutating: true },
      { name: 'list_invite_links', desc: 'List links' },
      { name: 'revoke_invite_link', desc: 'Revoke a link', mutating: true },
      { name: 'list_invite_joiners', desc: 'Who joined via a link' },
    ],
  },
  {
    id: 'topics',
    title: 'Forum topics',
    tools: [
      { name: 'list_topics', desc: 'List topics' },
      { name: 'create_topic', desc: 'New topic', mutating: true },
      { name: 'edit_topic', desc: 'Rename / close / hide', mutating: true },
    ],
  },
  {
    id: 'drafts',
    title: 'Drafts',
    tools: [
      { name: 'save_draft', desc: 'Save a draft', mutating: true },
      { name: 'clear_draft', desc: 'Clear a draft', mutating: true },
      { name: 'list_drafts', desc: 'All drafts' },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    tools: [
      { name: 'mute_peer', desc: 'Mute', mutating: true },
      { name: 'unmute_peer', desc: 'Unmute', mutating: true },
      { name: 'get_notify_settings', desc: 'Read settings' },
      { name: 'set_notify_settings', desc: 'Update settings', mutating: true },
    ],
  },
  {
    id: 'folders',
    title: 'Folders (chat filters)',
    tools: [
      { name: 'create_folder', desc: 'New folder', mutating: true },
      { name: 'edit_folder', desc: 'Edit folder', mutating: true },
      { name: 'delete_folder', desc: 'Delete folder', mutating: true },
      { name: 'reorder_folders', desc: 'Reorder folders', mutating: true },
    ],
  },
  {
    id: 'contacts',
    title: 'Contacts',
    tools: [
      { name: 'list_contacts', desc: 'List contacts' },
      { name: 'add_contact', desc: 'Add', mutating: true },
      { name: 'delete_contact', desc: 'Delete', mutating: true },
      { name: 'search_contacts', desc: 'Search directory' },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy & blocking',
    tools: [
      { name: 'block_user', desc: 'Block', mutating: true },
      { name: 'unblock_user', desc: 'Unblock', mutating: true },
      { name: 'list_blocked', desc: 'Block list' },
      { name: 'get_privacy', desc: 'Read a privacy key' },
      { name: 'set_privacy', desc: 'Update a privacy key', mutating: true },
    ],
  },
  {
    id: 'stickers',
    title: 'Stickers',
    tools: [
      { name: 'get_my_stickers', desc: 'Installed sets' },
      { name: 'install_sticker_set', desc: 'Install set', mutating: true },
      { name: 'add_recent_sticker', desc: 'Pin to recent', mutating: true },
    ],
  },
  {
    id: 'boosts',
    title: 'Premium boosts',
    tools: [
      { name: 'get_my_boosts', desc: 'Own boost slots' },
      { name: 'apply_boost', desc: 'Apply to a channel', mutating: true },
    ],
  },
  {
    id: 'bots',
    title: 'Bots & raw bridge',
    tools: [
      { name: 'get_inline_bot_results', desc: 'Inline bot query' },
      { name: 'invoke_mtproto', desc: 'Raw MTProto method', mutating: true },
    ],
  },
];

export function allToolNames(): string[] {
  const out: string[] = [];
  for (const g of TOOL_CATALOG) for (const t of g.tools) out.push(t.name);
  return out;
}

// Populate REQUIRED_TOOLS at module load so callers don't have to rescan.
for (const g of TOOL_CATALOG) {
  for (const t of g.tools) if (t.required) REQUIRED_TOOLS.add(t.name);
}
