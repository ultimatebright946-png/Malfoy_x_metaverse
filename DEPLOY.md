# Free hosting without Render
The bot needs an always-on process and a folder that survives restarts. A free **VM** gives you both; most free "app" hosts do not (their disk is wiped).
Options as of Nov 2026 (check current terms, they change): **Oracle Cloud Always Free** (card needed for signup; its ARM allowance was reduced in 2026, idle instances can be reclaimed, so keep a Pay-As-You-Go account within limits), or **Google Cloud e2-micro** free tier (card needed). A spare PC or Raspberry Pi at home also works.
Steps on any Ubuntu VM:
1. Open ports 80 and 443 in the cloud firewall (Oracle: VCN security list; Google: firewall rule).
2. `curl -fsSL https://get.docker.com | sh`, then upload and unzip this folder.
3. Get a free domain name pointing at the VM's public IP (e.g. a DuckDNS subdomain, or your own domain).
4. `cp .env.example .env` and fill it. Set `DOMAIN` and `PUBLIC_URL=https://<domain>`. Placeholders only in the file you share.
5. `docker compose up -d --build`. Caddy gets the HTTPS certificate automatically.
6. Discord only: set the Interactions Endpoint URL to `https://<domain>/discord/interactions`, then run `docker compose run --rm app npm run discord:register`.
7. WhatsApp only: `docker compose logs -f app` and pair with the QR / pairing code.
8. Backups: add `scripts/backup.sh` to cron and copy the archives off the VM now and then.
Updating: unzip the new version over the folder (keep `data/` and `.env`) and run `docker compose up -d --build`.
