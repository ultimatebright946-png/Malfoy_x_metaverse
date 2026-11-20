# Neon database + never logged out + auto-restart

This bot now runs under a small supervisor (`start.js`, started automatically by `npm start` / `node index.js`).

## What it does
1. **Auto-restart.** If the bot stops for any reason (crash, WhatsApp offline for 10 minutes, memory, an error) it is started again within seconds. If it keeps crashing it waits longer between tries (up to 60 s) instead of looping.
2. **Not logged out on redeploy.** While the bot runs, a copy of your WhatsApp login (`DATA_DIR/auth`) and the player database (`DATA_DIR/database/db.json`) is kept in a **Neon** Postgres database. When the bot starts on a new, empty disk it puts them back **before** connecting, so WhatsApp sees the same linked device and you do not have to scan a QR code or enter a pairing code again.
3. **Player data survives a wiped disk.** Same copy, same restore.

The local files stay the working copy. Neon is the safety copy, written every 15 seconds when something changed and once more on shutdown. If Neon is unreachable the bot carries on with the local files and retries.

## Set it up (5 minutes, free)
1. Create a free account at https://neon.tech and make a project.
2. On the project dashboard click **Connect** and copy the connection string. It looks like
   `postgresql://user:password@ep-something.region.aws.neon.tech/neondb?sslmode=require`
3. Put it in your environment as `NEON_DATABASE_URL` (in `.env`, or your host's environment variables).
4. Start the bot. The log shows `[supervisor] Neon backup is ON`. The table `malfoy_kv` is created automatically.

First deploy: link WhatsApp as usual (QR or pairing code). Within 15 seconds the login is copied to Neon. From then on, redeploys restore it.

## Good to know
- **Run only one copy of the bot at a time** with the same Neon database. Two WhatsApp sessions on one login fight each other and WhatsApp can log it out.
- If you **log the linked device out from your phone**, the bot moves the dead session aside and removes it from Neon, then asks for a new login.
- To start completely fresh, delete the rows from the `malfoy_kv` table (Neon console > SQL editor: `delete from malfoy_kv;`) and the `auth` folder.
- Optional: `NEON_SYNC_SECONDS=15` changes how often changes are copied.
- This is a **backup/restore mirror**, not a rewrite of the game onto SQL tables. Game data is still one JSON document, now with an off-site copy in Postgres. Profile pictures that players upload to the website are stored in the `uploads` folder and are not copied to Neon.
- Your Neon connection string is a password. Keep it out of anything you share.
