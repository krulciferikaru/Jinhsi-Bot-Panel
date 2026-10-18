import type { BotTarget } from './manager';

/** Discord permission bits the bot asks for. Slash commands themselves come from the applications.commands scope. */
export const INVITE_PERMISSIONS = [
  { bit: 2048n, name: 'Send Messages', why: 'Reply in channels where you use its commands.' },
  { bit: 16384n, name: 'Embed Links', why: 'Show build, echo and weapon cards.' },
  { bit: 262144n, name: 'Use External Emojis', why: 'Show element and stat icons in those cards.' },
] as const;

export const INVITE_SCOPES = ['bot', 'applications.commands'] as const;

const ENV = {
  test: { token: 'DISCORD_TOKEN_TEST', client: 'DISCORD_CLIENT_ID_TEST' },
  live: { token: 'DISCORD_TOKEN_LIVE', client: 'DISCORD_CLIENT_ID_LIVE' },
} as const;

/**
 * The application (client) id. Use DISCORD_CLIENT_ID_<TARGET> if set; otherwise it is the first part of the bot
 * token, which is the bot user's id. Only the id is returned, never any part of the secret.
 */
/** Server-side only. Never send this to the browser. */
export const tokenFor = (target: BotTarget): string | null => process.env[ENV[target].token]?.trim() || null;

export function clientIdFor(target: BotTarget): string | null {
  const explicit = process.env[ENV[target].client]?.trim();
  if (explicit && /^\d{15,25}$/.test(explicit)) return explicit;
  const token = process.env[ENV[target].token]?.trim();
  if (!token) return null;
  try {
    const id = Buffer.from(token.split('.')[0], 'base64').toString('utf8');
    return /^\d{15,25}$/.test(id) ? id : null;
  } catch { return null; }
}

export function inviteUrl(target: BotTarget): string | null {
  const id = clientIdFor(target);
  if (!id) return null;
  const permissions = INVITE_PERMISSIONS.reduce((a, p) => a | p.bit, 0n).toString();
  const q = new URLSearchParams({ client_id: id, permissions, scope: INVITE_SCOPES.join(' ') });
  return `https://discord.com/oauth2/authorize?${q}`;
}
