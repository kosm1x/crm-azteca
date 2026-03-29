# Deployment Guide

## AWS EC2 Setup

### Recommended Instance

| Resource | Specification |
|----------|--------------|
| Instance | c6i.2xlarge (8 vCPU, 16 GB RAM) |
| Storage | 100 GB EBS gp3, encrypted |
| OS | Amazon Linux 2023 |
| Network | VPC private subnet, Elastic IP |

### Monthly Cost

| Component | Cost/mo |
|-----------|---------|
| EC2 c6i.2xlarge | ~$250 (on-demand), ~$150 (reserved) |
| EBS gp3 100 GB | ~$10 |
| EBS snapshots | ~$5 |
| S3 backups | ~$2 |
| CloudWatch | ~$5 |
| **Total** | **~$270/mo** |

### Setup Steps

1. **Provision EC2 instance**
   ```bash
   # Amazon Linux 2023, c6i.2xlarge
   # 100 GB gp3 EBS, encrypted
   # Security group: outbound only (no inbound except SSH/SSM)
   ```

2. **Install dependencies**
   ```bash
   sudo dnf install -y docker git nodejs
   sudo systemctl enable --now docker
   sudo usermod -aG docker $USER
   ```

3. **Clone and configure**
   ```bash
   git clone https://github.com/kosm1x/agentic-crm.git
   cd agentic-crm
   cp .env.example .env
   # Edit .env with API keys
   npm install
   ```

4. **Build container image**
   ```bash
   npm run build:container
   ```

5. **Authenticate WhatsApp**
   ```bash
   cd engine && npm run auth
   # Scan QR code with dedicated phone number
   ```

6. **Install systemd service**
   ```bash
   cp systemd/agentic-crm.service ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable agentic-crm
   systemctl --user start agentic-crm
   ```

## systemd Service

The service file is at `systemd/agentic-crm.service`. It:
- Runs as the current user (not root)
- Restarts on failure with 5-second delay
- Sets working directory to the repo root
- Passes environment from `.env`

## Backups

### Automated SQLite Backup

```bash
# Add to crontab:
0 3 * * * cd /home/ec2-user/agentic-crm && sqlite3 store/messages.db ".backup /tmp/crm-backup.db" && aws s3 cp /tmp/crm-backup.db s3://your-bucket/backups/crm-$(date +\%Y\%m\%d).db
```

### EBS Snapshots

Configure daily EBS snapshots via AWS Data Lifecycle Manager with 7-day retention.

## Monitoring

### CloudWatch Auto-Recovery

Create a CloudWatch alarm that triggers EC2 auto-recovery on system status check failures. This restarts the instance on the same hardware if it becomes unreachable.

### Log Monitoring

```bash
# View live logs
journalctl --user -u agentic-crm -f

# View last 100 lines
journalctl --user -u agentic-crm -n 100
```

## Security

| Layer | Protection |
|-------|-----------|
| Network | VPC private subnet, outbound-only |
| Disk | EBS encryption at rest (AWS KMS) |
| Secrets | `.env` on encrypted disk, passed via stdin to containers |
| OS | Amazon Linux 2023, auto-patched via SSM |
| Docker | Containers run as non-root (uid 1000) |
| Access | IAM roles, SSH keys or SSM Session Manager |
