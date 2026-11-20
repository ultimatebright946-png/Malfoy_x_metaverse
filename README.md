# MALFOY-MD (25.0.0)

## What is included (all covered by `npm test`, plus a browser check script)
Persistence (atomic writes, backups, corrupt-DB recovery, migrations), registry-driven `.menu`/`.help` for WhatsApp and Discord, Awakening, card collection, guilds, social feed, character creator, boss battles (server-side sessions), secure Discord linking, the Discord Interactions endpoint, and the new website: sidebar + mobile nav, Home, Discover, Character (live preview), Awakening, Skills, Inventory (cards, gear, trades), Quests, Dungeons, Boss Battles, Guilds, Leaderboards, Music (3 original synthesized tracks + mini player), Settings (account linking, password), Community (posts, likes, comments, follows, notifications), activity panel, canvas crow animation. Existing pages (shop, bank, wallet, arena, duel, guide) are kept.
Browser checks (Playwright, run from the source project with `node test/site.check.js`) verified layout without horizontal overflow at 390px and 1440px, moving crows, reduced-motion and hidden-tab behaviour, real audio playback and seeking, the character save round-trip, a full boss fight through the UI with no duplicate rewards.

## Known limits (honest list)
- Not tested live: WhatsApp (Baileys) connection, WebSocket duels, a real Discord server, a real server deploy.
- Section 12 (economy extensions) of the brief was cut off before its list, so none were added. Send the missing text to add them.
- Boss balance: stats do not scale with level (HP is masks, damage comes from gear and charms). A fresh character beats the first boss; later bosses are gear-gated. Run `node --test test/game.test.js` to see the win-rate report.
- The game has no stamina stat; HP (masks) and MP (soul) are what exist.
- Express was replaced by `lib/mini.js` (same routes, no dependency) because packages could not be installed where this was built.
- Card art and character art are original vector drawings made in code; the crows are drawn on a canvas. Music is synthesized and original. Replace any of it freely.
- Discord slash commands cover registry main names only (aliases are text-prefix only); Discord cannot receive attachments for commands such as sticker, which stay WhatsApp-only.

## Data and persistence
Data lives in `DATA_DIR` (default `/var/data`; docker-compose maps it to `./data` on the host). Whatever host you use, it **must keep that folder between restarts** (a VM disk or volume). Hosts with an ephemeral filesystem will lose player data.
Startup never overwrites existing data. Writes are atomic; rolling backups are kept; a corrupt file is preserved under `corrupt/` and the newest valid backup is used before any empty database is created. Owner commands: `dbstatus`, `backup`, `restore`.
Do not put `/var/data`, `auth/`, `.env` or database files in git. Only one running copy may use a data folder. To share players between WhatsApp and Discord, run the WhatsApp edition with the `DISCORD_*` variables set (one process, one folder). Two separate servers would need an external database, which this build does not include.

## Discord setup
1. Create an application at the Discord Developer Portal. Copy the Application ID and Public Key.
2. Set `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_OWNER_IDS` in your `.env`. Set the **Interactions Endpoint URL** to `https://YOUR-DOMAIN/discord/interactions`.
3. Run once from your own machine: `DISCORD_BOT_TOKEN=... DISCORD_APP_ID=... npm run discord:register` (token is used only for this).
4. Invite the app with the `applications.commands` scope.
Discord identities are separate from WhatsApp ones. To share a profile: website Settings API `POST /api/link/discord/start` gives a one-time code (hashed, expires), then `/link` in Discord. `/weblogin` returns a private single-use sign-in link. No passwords or OTPs are sent through Discord.

## Hosting (free option, no Render)
See `DEPLOY.md`: a free always-on VM (Oracle Cloud Always Free or Google Cloud e2-micro) running `docker compose up -d`, with automatic HTTPS from Caddy.

## WhatsApp setup
`npm install`, copy `.env.example` to `.env`, fill the placeholders, `npm start`; pair via `/qr?key=QR_KEY` or the pairing number.

## Music
Three original tracks are bundled in `web/music/`. Add more `.mp3/.ogg/.wav` files you have the rights to use there (and list them in `tracks.json`) or in `DATA_DIR/music/`.
Official community: https://chat.whatsapp.com/DEzTmMDm4nxG2ZWIQ0Pvw5

## Imperial hierarchy and moderation

The shared WhatsApp/website/Discord project now has this court hierarchy:

1. King — configured owner (`OWNER_NUMBER` / `DISCORD_OWNER_IDS`).
2. Moderator — appointed by the King; can warn, exile and pardon regular players.
3. Noble — assigned by the King.
4. Knight — assigned by the King.
5. Citizen — assigned by the King.
6. Peasant — default player title.
7. Exiled — access suspended across WhatsApp commands, Discord interactions and website sessions.

Commands (WhatsApp prefix or Discord slash commands):

- `hierarchy` — show all titles.
- `title [player]` — show a title.
- `mod <player>` / `unmod <player>` — King only; appoint or remove moderators.
- `settitle <player> <noble|knight|citizen|peasant>` — King only.
- `exile <player> [reason]` — King or Moderator. Moderators cannot exile the King or another Moderator.
- `pardon <player>` — King or Moderator. Only the King can restore an Exiled Moderator.
- `warnplayer <player> [reason]` and `warnings [player]` — King or Moderator.

Only the King can appoint/remove moderators or assign court titles. Exile/pardon and warning actions are recorded in the affected player's moderation history. A pardon restores the player's prior title.
"# Malfoy_x_metaverse" 
