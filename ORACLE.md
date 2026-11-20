# Deploying on Oracle Cloud Always Free (step by step)
Read DEPLOY.md first for the overview. Oracle's console wording changes, so follow the idea if a label differs.

## 1. Account
- Sign up at oracle.com/cloud/free. A card is required for verification. **Choose your home region carefully: it cannot be changed later**, and free capacity is not equal in every region.
- Stay on Always Free resources only. Do not resize shapes or add paid services, or you can be billed.

## 2. Create the VM
- Menu > Compute > Instances > Create instance. Image: **Ubuntu 22.04 or 24.04**. Shape: **VM.Standard.E2.1.Micro** (AMD, 1 GB RAM, Always Free), or an Ampere A1 shape if available ("out of capacity" is common: retry later or try another availability domain). Everything here is multi-architecture, so both work.
- Download the SSH private key when offered. Keep it safe. Choose "assign a public IPv4 address".
- Afterwards: Networking > IP management > Reserved public IPs, and attach a reserved IP so the address never changes.

## 3. Open the ports (two places, both are needed)
1. Cloud firewall: Networking > Virtual cloud networks > your VCN > Security lists > Default > Add ingress rules: source 0.0.0.0/0, TCP, destination ports **80** and **443** (SSH 22 is already open).
2. Inside the VM (Oracle's Ubuntu images also block traffic with iptables):
```
sudo iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
sudo apt-get update && sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save
```

## 4. Prepare the server
```
ssh -i your-key ubuntu@YOUR_PUBLIC_IP
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker ubuntu && exit
```
(The swap file matters on the 1 GB machine so builds do not run out of memory. Log in again after `exit` so the docker group applies.)

## 5. Domain name
Make a free subdomain at duckdns.org (or use your own domain) and point it at the reserved public IP. Wait a minute for DNS.

## 6. Deploy
From your computer: `scp -i your-key MALFOY-MD-*.zip ubuntu@YOUR_PUBLIC_IP:~` then on the server:
```
sudo apt-get install -y unzip && unzip MALFOY-MD-*.zip && cd MALFOY-MD-*/
cp .env.example .env && nano .env      # set DOMAIN, PUBLIC_URL=https://<domain>, secrets, owner number / Discord values
docker compose up -d --build
docker compose logs -f app
```
- WhatsApp edition: scan the QR or use the pairing code shown in the logs.
- Discord: set Interactions Endpoint URL to `https://<domain>/discord/interactions`, then `docker compose run --rm app npm run discord:register`.
- Check: open `https://<domain>/health`.

## 7. Keep it healthy
- Backups: `crontab -e` and add `0 */6 * * * /home/ubuntu/MALFOY-MD-*/scripts/backup.sh`; download the archives to your own computer now and then.
- Updates: upload the new ZIP, unzip over the folder (keep `data/` and `.env`), `docker compose up -d --build`.
- Oracle may reclaim Always Free instances it judges idle for a long time. If the VM disappears, your `data/` backups are what protect your players.
