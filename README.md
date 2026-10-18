# Jinhsi Bot Panel

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-6-47A248?logo=mongodb&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-14-5865F2?logo=discord&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

A web panel and Discord bot for **Wuthering Waves** game data. It replaces hand-edited data files with forms, CSV imports and an activity log, and runs the Discord bot that answers slash commands from the same MongoDB database, so a change made in the panel shows up in Discord on the next command.

## Features

- **Data management:** add, edit, view, archive, restore and delete **resonators, echoes, weapons, builds and skills**, with filters, pagination and a preview before saving.
- **Bulk CSV import:** a dry run first, then create or update records. A bad import can be undone in one step.
- **Activity log with undo:** every create, update, archive, restore, delete and import is recorded and can be reversed.
- **Build editor:** echo sets made of several parts (for example `Void Thunder X2 + Endless Resonance X2 + Shadow of Shattered Dreams X1`), 43311 and 44111 echo cost layouts, several main echoes of any cost, other 2-piece sets that pair well, and tick-box stat pickers. Dropdowns are narrowed to the echoes that fit the chosen set and show icons.
- **Autofill:** echo cost, class, Sonata sets and description from public game data (Encore.moe), and Discord emoji codes from emojis that already exist.
- **Asset library:** upload, rename and delete icons in a GitHub repository, with bulk upload as a single commit, WebP and JPEG converted to PNG, and a one-click button that attaches unused icons to records with the same name.
- **Discord emoji management:** create, rename and delete application emojis for the Live and Test bots, and link them to records.
- **Discord bot:** `/build`, `/skill`, `/echo`, `/weapon`, `/resonatorlist`, `/echolist`, `/weaponlist`, `/help` and `/ping`. Embeds show each bot's own emojis for elements, weapons, echoes, sets and stats.
- **Test and Live bots:** start and stop each from the home page, plus a command tester in the browser that needs no Discord.
- **Separate development database:** `npm run dev` and `npm start` can use different databases, with a script to copy production data into development.
- **Health report:** lists missing icons, empty details and records the bot cannot answer well.
- **Backup and restore:** export and restore the whole database.

## Tech Stack

- **Frontend / Backend / Core:** Next.js 15 (App Router and route handlers), React 19, TypeScript, Tailwind CSS 4, daisyUI 5, `motion`, Lenis, discord.js 14, `sharp`.
- **Database / State Management:** MongoDB (official `mongodb` driver 6). Icons are stored in a GitHub repository and read and written through the GitHub REST API.
- **DevOps / Build Tools:** npm, TypeScript, PostCSS (`@tailwindcss/postcss`), `next build` and `next start`.

## Installation & Setup

**Requirements:** Node.js 18.18 or newer, a MongoDB database (local or Atlas), and a Discord application with a bot token for each bot you want to run.

1. Clone the repository:

   ```bash
   git clone https://github.com/krulciferikaru/Jinhsi-Bot-Panel.git
   ```

2. Navigate to the directory:

   ```bash
   cd Jinhsi-Bot-Panel
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Configure environment variables. Copy the example file and fill in your own values:

   ```bash
   cp .env.example .env.local
   ```

   | Variable | Required | What it does |
   | --- | --- | --- |
   | `MONGODB_URI` | Yes | MongoDB connection string, for example `mongodb://127.0.0.1:27017` or your Atlas URI. |
   | `MONGODB_DB` | Yes | Database name. The example uses `wuthering_waves`. |
   | `DISCORD_TOKEN_TEST` | No | Token for the Test bot. Leave empty to disable it. |
   | `DISCORD_GUILD_ID_TEST` | No | Test server ID. Registers slash commands there instantly. |
   | `DISCORD_TOKEN_LIVE` | No | Token for the Live bot. Leave empty to disable it. |
   | `DISCORD_GUILD_ID_LIVE` | No | Server ID for the Live bot. Without it, commands register globally and can take a while to appear. |
   | `GITHUB_TOKEN` | No | Fine-grained token with **Contents: Read and write** on the asset repository only. Needed for icon uploads. |
   | `GITHUB_REPO` | No | Asset repository as `owner/name`. |
   | `GITHUB_BRANCH` | No | Asset repository branch. Defaults to `main`. |
   | `DISCORD_CLIENT_ID_TEST`, `DISCORD_CLIENT_ID_LIVE` | No | Only needed if the application id cannot be worked out from the bot token (used for emoji management). |

   Values go in `.env.local`, which is ignored by Git. Never commit tokens.

5. Start the local server:

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000`.

For a production build, run `npm run build` and then `npm start`.

### Development and production databases

Next.js reads a different env file for each command, so the two can use different databases:

| Command | Env file with the database name | Example |
| --- | --- | --- |
| `npm run dev` | `.env.development.local` | `MONGODB_DB=wuthering_waves_dev` |
| `npm start` | `.env.production.local` | `MONGODB_DB=wuthering_waves` |

`MONGODB_URI` and the tokens stay in `.env.local`. The name of the database in use is shown in the page footer. Edits made while running `npm run dev` go to the development database only.

To fill the development database with a copy of the production data:

```bash
npm run db:copy-dev               # copies into an empty development database
npm run db:copy-dev -- --replace  # empties the development database first, then copies
```

The script only reads the production database and only writes to the development one. It stops if both environments point at the same database.

> **Warning:** the panel has no login. Run it on your own machine or behind your own access control. Do not expose it to the public internet as it is.

### Letting other servers add the bot

The panel does not include a public page. The "Add to Discord" page is a separate project, **Jinhsi Bot** (repository `Jinhsi-Bot`).

## Usage Examples

**Slash commands** (after starting a bot from the home page):

```text
/build resonator:Jinhsi variant:Celestial Light
/weapon name:Kumokiri
/echo name:Hecate
/resonatorlist sort_by:element
```

**Import data from CSV.** Open **Import** from the footer, choose a collection, upload a file and run the dry run before importing. Ready-to-use templates are in `import-templates/`. For example, a builds file looks like this:

```csv
resonator_id,build_name,echo_set,main_echo,main_stats,sub_stats_priority
Jinhsi,Celestial Light,Celestial Light X5,Jue,CRIT RATE|CRIT DMG,Energy Regen >= CRIT RATE = CRIT DMG > ATK%
```

Use `|` or `;` to separate several values in one cell. In **Update** mode, rows are matched by name (for builds, by resonator and build name) and only the columns you include are changed.

## Running Tests

This project has no automated test suite yet. To check the code, run the TypeScript compiler and a production build:

```bash
npx tsc --noEmit
npm run build
```

## Contributing

Fork the repository, create a feature branch, and open a pull request that describes the change. Run `npx tsc --noEmit` before submitting, and never include real tokens, connection strings or `.env` files.

## License

Distributed under the MIT License. See `LICENSE` for more information.
