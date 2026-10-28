# Jinhsi Bot Panel

**A local, no-login Next.js dashboard that manages Wuthering Waves game data in MongoDB, maintains the icon and emoji assets on GitHub, and runs the Test and Live Discord bots from one interface.**

- **Schema-driven CRUD.** Resonators, echoes, weapons, builds, and skills are edited through forms and views generated from a single schema definition.
- **Asset and emoji pipeline.** Uploads icons to a GitHub repository (converted to PNG via `sharp`) and creates matching Discord application emojis per bot.
- **In-process bot control.** Starts, stops, and previews the Test and Live bots and their slash-command replies without leaving the dashboard.
- **Operational tooling.** Health scan for missing or broken data, bulk CSV/JSON import with preview, an undoable activity log, and backup/restore.
- **Guided setup and fast UX.** A step-by-step "set up a resonator" wizard with database-backed drafts, plus optimistic updates, cached lists, and idempotent writes.

> **This dashboard is intended to run locally and must not be exposed publicly — it has no authentication.**

## 🛠️ Architecture & Core Stack

A Next.js App Router application. Server-side **route handlers** under `app/api` own all MongoDB and GitHub access; **client components** render the schema-driven UI and call those endpoints. The bot runtime (`lib/bot`) runs inside the Next.js process and is controlled through API routes. Images are optimized through Next's image layer and processed with `sharp` on upload.

| Component | Directory / File | Technology |
| --- | --- | --- |
| Routing, pages, API handlers | `app/`, `app/api/` | Next.js 15 (App Router) |
| UI components | `components/` | React 19, Tailwind CSS 4, daisyUI 5 |
| Motion & smooth scroll | `components/` | `motion`, `lenis` |
| Schema, types, helpers | `lib/schema.ts` | TypeScript |
| Data access layer | `lib/db.ts` | mongodb driver |
| Discord bot runtime | `lib/bot/` | discord.js 14 |
| Asset & emoji services | `lib/github.ts`, `lib/discord-emoji.ts` | GitHub REST, discord.js REST, `sharp` |
| Maintenance scripts | `scripts/` | Node.js (ESM) |
| Runtime | — | Node.js 20+ |

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20 or newer
- **npm** 10+
- A **MongoDB** instance (a separate database per environment is recommended)
- A **GitHub** personal access token with write access to the asset repository
- One or two **Discord applications** (Test and/or Live) with bot tokens

### Installation

```bash
git clone https://github.com/krulciferikaru/Jinhsi-Bot-Panel.git
cd Jinhsi-Bot-Panel
npm install
cp .env.example .env.local
```

### Environment Variables

Shared values go in `.env.local`. The database name is split per environment: put `MONGODB_DB` in `.env.development.local` and `.env.production.local` to point `next dev` and `next start` at different databases.

```dotenv
# --- Database ---
MONGODB_URI=mongodb+srv://user:password@cluster.example.mongodb.net
MONGODB_DB=wuthering_waves_dev        # override per environment file

# --- Discord bots (per target) ---
DISCORD_TOKEN_TEST=your-test-bot-token
DISCORD_CLIENT_ID_TEST=000000000000000000
DISCORD_GUILD_ID_TEST=000000000000000000
DISCORD_TOKEN_LIVE=your-live-bot-token
DISCORD_CLIENT_ID_LIVE=000000000000000000
DISCORD_GUILD_ID_LIVE=000000000000000000

# --- Asset repository (GitHub) ---
GITHUB_TOKEN=github_pat_xxx
GITHUB_REPO=krulciferikaru/Database
GITHUB_BRANCH=main
```

## 💻 Usage & Workflows

```bash
# Start the local development server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Serve the production build
npm start

# Copy data from the production database into the development database
npm run db:copy-dev

# Type-check the project (compile-time gate; no test runner is configured)
npx tsc --noEmit
```

**Notes**

- Run a single development server at a time; the bot runtime holds process-level state.
- `next build` runs ESLint and the production type-check; use it together with `npx tsc --noEmit` as the quality gate before shipping. There is no unit-test suite.
- Never commit `.env.local` or any environment file containing tokens.

## 🤝 Contributing

1. **Branch:** create a feature branch off `development` (e.g. `git checkout -b feature/<short-name>`).
2. **Verify:** run `npx tsc --noEmit` and `npm run build`; confirm affected pages and flows in `npm run dev`.
3. **Open a PR:** push the branch and open a pull request into `development` with a concise summary; releases merge `development` into `main`.

## 📄 License

Released under the **MIT License**. See [`LICENSE`](./LICENSE).
