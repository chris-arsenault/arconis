#!/bin/bash
# First-boot provisioning for the Arconis relay (AL2023 arm64).
# Terraform template: double-dollar braces are shell, single are Terraform.
#
# The maximum-runtime unit installs before anything that can fail, so a broken provision cannot
# leave the instance running indefinitely.
set -euxo pipefail

cat > /etc/systemd/system/arconis-max-uptime.service <<EOF
[Unit]
Description=Hard stop ${max_uptime_minutes} minutes after boot
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/sbin/shutdown -h +${max_uptime_minutes}

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now arconis-max-uptime.service

dnf -y install nodejs24

useradd --system --no-create-home --shell /sbin/nologin arconis-relay || true
mkdir -p /opt/arconis

# Fetching on every boot means a deploy reaches the relay at its next start.
# A clean exit is the relay deciding to stop, so it shuts the instance down; a crash restarts it.
# Instance shutdown behavior is "stop", so this leaves only the disk to pay for.
cat > /etc/systemd/system/arconis-relay.service <<EOF
[Unit]
Description=Arconis relay
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
User=arconis-relay
Environment=PORT=${port}
Environment=CONTROL_URL=${control_url}
Environment=ALLOWED_ORIGIN=${allowed_origin}
ExecStartPre=+/usr/bin/aws s3 cp s3://${bucket}/${key} /opt/arconis/server.cjs
ExecStart=/usr/bin/node-24 /opt/arconis/server.cjs
ExecStopPost=+/bin/sh -c 'if [ "\$\$EXIT_CODE" = exited ] && [ "\$\$EXIT_STATUS" = 0 ]; then /usr/sbin/shutdown -h now; fi'
Restart=on-failure
RestartSec=5
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now arconis-relay.service
