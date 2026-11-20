#!/bin/sh
# Off-box copy of the player data. Run from cron: 0 */6 * * * /path/to/scripts/backup.sh
set -e; cd "$(dirname "$0")/.."; mkdir -p backups-offsite
tar czf "backups-offsite/malfoy-$(date +%Y%m%d-%H%M).tgz" --exclude=auth data
ls -1t backups-offsite/*.tgz | tail -n +29 | xargs -r rm -f
