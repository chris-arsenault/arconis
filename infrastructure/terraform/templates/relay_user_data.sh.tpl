#!/bin/bash
# Boot provisioning for an Arconis relay instance (AL2023 arm64). Every instance is new, because the
# relay's Auto Scaling group scales to zero when idle. Everything that outlives an instance is outside
# it, so replacing one loses nothing.
# Terraform template: double-dollar braces are shell, single are Terraform.
#
# Relay build ${relay_version}: naming it here rolls the group when the relay's code changes.
#
# The maximum-runtime units install before anything that can fail, so a broken provision cannot
# leave an instance running indefinitely.
set -euxo pipefail

# Shutting down is not enough, because the group would replace the instance. Leaving the group this
# way also lowers its desired capacity, and touches no other instance.
cat > /usr/local/bin/arconis-retire <<'RETIRE'
#!/bin/bash
set -euo pipefail
TOKEN=$(curl -sf -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')
ID=$(curl -sf -H "X-aws-ec2-metadata-token: $${TOKEN}" http://169.254.169.254/latest/meta-data/instance-id)
exec aws autoscaling terminate-instance-in-auto-scaling-group --region ${region} \
  --instance-id "$${ID}" --should-decrement-desired-capacity
RETIRE
chmod +x /usr/local/bin/arconis-retire

cat > /etc/systemd/system/arconis-max-uptime.service <<EOF
[Unit]
Description=Leave the group after the maximum runtime

[Service]
Type=oneshot
ExecStart=/usr/local/bin/arconis-retire
EOF

cat > /etc/systemd/system/arconis-max-uptime.timer <<EOF
[Unit]
Description=Hard stop ${max_uptime_minutes} minutes after boot

[Timer]
OnBootSec=${max_uptime_minutes}min

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now arconis-max-uptime.timer

dnf -y install nodejs24

useradd --system --no-create-home --shell /sbin/nologin arconis-relay || true
mkdir -p /opt/arconis

# A clean exit is the relay deciding to stop, so the instance leaves the group; a crash restarts the
# process. A signal from a rollout or from being scaled in does neither.
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
Environment=PICTURE_BUCKET=${picture_bucket}
ExecStartPre=+/usr/bin/aws s3 cp s3://${bucket}/${key} /opt/arconis/server.cjs
ExecStart=/usr/bin/node-24 /opt/arconis/server.cjs
ExecStopPost=+/bin/sh -c 'if [ "\$\$EXIT_CODE" = exited ] && [ "\$\$EXIT_STATUS" = 0 ]; then /usr/local/bin/arconis-retire; fi'
Restart=on-failure
RestartSec=5
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now arconis-relay.service
