import {
  Client, EmbedBuilder, GatewayIntentBits, SlashCommandBuilder, type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { COMMANDS, runCommand, suggest, type Reply } from './commands';

export type BotTarget = 'test' | 'live';
export type BotStatus = 'stopped' | 'starting' | 'online' | 'error';
type State = {
  client: Client | null;
  status: BotStatus;
  tag?: string;
  error?: string;
  startedAt?: number;
  commandsRun: number;
  logs: { t: number; level: 'info' | 'warn' | 'error'; msg: string }[];
};

const ENV = {
  test: { token: 'DISCORD_TOKEN_TEST', guild: 'DISCORD_GUILD_ID_TEST' },
  live: { token: 'DISCORD_TOKEN_LIVE', guild: 'DISCORD_GUILD_ID_LIVE' },
} as const;

const g = globalThis as unknown as { __bots?: Record<BotTarget, State> };
const fresh = (): State => ({ client: null, status: 'stopped', commandsRun: 0, logs: [] });
const states = () => (g.__bots ??= { test: fresh(), live: fresh() });
export const isTarget = (t: unknown): t is BotTarget => t === 'test' || t === 'live';

function log(target: BotTarget, msg: string, level: 'info' | 'warn' | 'error' = 'info') {
  const s = states()[target];
  s.logs.push({ t: Date.now(), level, msg });
  if (s.logs.length > 200) s.logs.shift();
}

export function snapshot(target: BotTarget) {
  const s = states()[target];
  return {
    target, status: s.status, tag: s.tag, error: s.error, startedAt: s.startedAt, commandsRun: s.commandsRun,
    hasToken: Boolean(process.env[ENV[target].token]?.trim()),
    servers: s.status === 'online' ? s.client?.guilds.cache.size : undefined,
    logs: s.logs.slice(-60),
  };
}
export const snapshotAll = () => ({ test: snapshot('test'), live: snapshot('live') });

function toDiscord(r: Reply) {
  const out: { content?: string; embeds?: EmbedBuilder[] } = {};
  if (r.content) out.content = r.content;
  if (r.embed) {
    const e = new EmbedBuilder();
    if (r.embed.title) e.setTitle(r.embed.title.slice(0, 256));
    if (r.embed.description) e.setDescription(r.embed.description.slice(0, 4096));
    if (r.embed.color) e.setColor(parseInt(r.embed.color.replace('#', ''), 16) || 0xf2f2f2);
    if (r.embed.thumbnail) e.setThumbnail(r.embed.thumbnail);
    if (r.embed.author) e.setAuthor({ name: r.embed.author.name.slice(0, 256), iconURL: r.embed.author.icon });
    if (r.embed.footer) e.setFooter({ text: r.embed.footer.slice(0, 2048) });
    if (r.embed.fields?.length) {
      e.addFields(r.embed.fields.slice(0, 25).map((f) => ({
        name: (f.name || '​').slice(0, 256), value: (f.value || '​').slice(0, 1024), inline: f.inline,
      })));
    }
    out.embeds = [e];
  }
  return out;
}

function definitions(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return COMMANDS.map((c) => {
    const b = new SlashCommandBuilder().setName(c.name).setDescription(c.description);
    // Discord requires required options first.
    for (const o of [...c.options].sort((x, y) => Number(!!y.required) - Number(!!x.required))) {
      b.addStringOption((s) => {
        s.setName(o.name).setDescription(o.description).setRequired(!!o.required);
        if (o.choices) s.addChoices(...o.choices.map((v) => ({ name: v, value: v })));
        else if (o.autocomplete) s.setAutocomplete(true);
        return s;
      });
    }
    return b.toJSON();
  });
}

export async function startBot(target: BotTarget) {
  const s = states()[target];
  if (s.status === 'online' || s.status === 'starting') return snapshot(target);
  const token = process.env[ENV[target].token]?.trim();
  if (!token) {
    s.status = 'error';
    s.error = `${ENV[target].token} is not set. Add it to .env.local and restart the app.`;
    log(target, s.error, 'error');
    return snapshot(target);
  }

  s.status = 'starting'; s.error = undefined;
  log(target, 'Starting bot…');
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  s.client = client;

  client.once('ready', async (c) => {
    try {
      const guildId = process.env[ENV[target].guild]?.trim();
      const guildCmds = guildId ? c.guilds.cache.get(guildId)?.commands : undefined;
      await (guildCmds ?? c.application.commands).set(definitions());
      log(target, `Registered ${COMMANDS.length} slash commands${guildCmds ? ` to guild ${guildId}` : ' globally (can take a while to appear)'}.`);
    } catch (e: any) {
      log(target, `Command registration failed: ${e.message}`, 'error');
    }
    s.status = 'online'; s.tag = c.user.tag; s.startedAt = Date.now();
    log(target, `Bot is connected to Discord as ${c.user.tag}.`);
  });

  client.on('interactionCreate', async (i) => {
    try {
      const args: Record<string, string | undefined> = {};
      if (i.isAutocomplete()) {
        const focused = i.options.getFocused(true);
        for (const o of i.options.data) if (typeof o.value === 'string') args[o.name] = o.value;
        const names = await suggest(i.commandName, focused.name, String(focused.value), args);
        await i.respond(names.map((n) => ({ name: n.slice(0, 100), value: n.slice(0, 100) })));
      } else if (i.isChatInputCommand()) {
        for (const o of i.options.data) if (typeof o.value === 'string') args[o.name] = o.value;
        const reply = await runCommand(i.commandName, args, { ping: client.ws.ping, target });
        s.commandsRun++;
        log(target, `/${i.commandName} by ${i.user.tag}`);
        await i.reply({ ...toDiscord(reply), ephemeral: reply.ephemeral });
      }
    } catch (e: any) {
      log(target, `Interaction error: ${e.message}`, 'error');
    }
  });

  client.on('error', (e) => log(target, `Client error: ${e.message}`, 'error'));
  client.on('shardDisconnect', () => log(target, 'Disconnected from Discord.', 'warn'));

  try {
    await client.login(token);
  } catch (e: any) {
    s.status = 'error'; s.error = e.message; s.client = null;
    log(target, `Login failed: ${e.message}`, 'error');
    client.destroy();
  }
  return snapshot(target);
}

export async function stopBot(target: BotTarget) {
  const s = states()[target];
  if (s.client) {
    await s.client.destroy();
    s.client = null;
    log(target, 'Bot stopped.');
  }
  s.status = 'stopped'; s.startedAt = undefined; s.tag = undefined; s.error = undefined;
  return snapshot(target);
}
