# Deployment

Pushing to `main` runs `.github/workflows/ci.yml`, which calls the shared Ahara CI workflow.
It gates deployment on browser tests, lint, types and unit tests, then applies Terraform through
the shared OIDC route.

## Infrastructure

Ahara admission lives in `ahara-infra/infrastructure/terraform/control/project-arconis.tf`.
`infrastructure/terraform/` owns:

- The relay: an Auto Scaling group behind the shared ALB at `relay.arconis.ahara.io`, its
  S3 bucket of relay code, and its security group and role.
- The control Lambda behind `/control/*` on the same host, and its SSM parameters.
- Arconis in the shared Ahara Auth0 tenant (`auth0.tf`): its database connection, the site's
  application and the accounts API it is granted, the MCP API with its default grant for registered
  connectors, the client that deletes users, and the post-login Action. The provider reads Ahara's credential from
  `/ahara/auth0/*`; the tenant, its branding and `auth.ahara.io` belong to ahara-infra.
- Accounts: a DynamoDB table, a private bucket of saved workspaces, and the API behind `/api/*` on the
  relay's host, whose ALB rule validates Auth0 tokens for the accounts API.
- Agents: the relay serves `/mcp` and reads the tenant's issuer from its boot script, and the website's
  runtime configuration names the MCP address for the account panel.
- The website, through Ahara's `website` module: private S3 with S3-managed encryption, behind
  CloudFront and ACM TLS, at `arconis.ahara.io`.
- Runtime configuration, delivered to browsers as `config.js`.

State uses the shared bucket at `projects/arconis.tfstate`. Arconis registers no login client.

Instances are disposable, and replacing one loses nothing: usage comes from CloudWatch by group name,
alerts and limits are in SSM, pictures are in S3, and documents are in browsers. Agent sessions end
with the instance, and agents reconnect. A deployment that
changes the relay's code or boot script rolls the group, launching the replacement and waiting for it to
pass the ALB's health check before terminating the old instance. When the relay is off there is nothing
to roll, and the next start uses the new version.

## Operating the relay

MCP tool and HTTP failures return an error reference. Search Grafana's Loki datasource with
`{service_name="arconis-relay"} |= "<error reference>"` to find the corresponding operation, exception
and stack. Expected language refusals are tool errors with recovery guidance; they are not server
faults. Relay log forwarding uses Alloy and the existing private Ahara gateway, whose address is
discovered by its `Name=ahara-reverse-proxy` tag. The gateway owns downstream ingest authentication.

On a running relay instance, `journalctl -u arconis-relay.service --no-pager` reads the local fallback,
and `journalctl -u alloy --no-pager` diagnoses shipping failures. Read these through SSM when needed;
in this environment, run secret-backed CLI commands through `with-cred --`. Other installations use
their ordinary AWS credential environment. The local journal ends with the instance; check Loki for
older shipped errors. A deployment is needed before changes to reporting or Alloy reach a running relay.

Raise the limit for the current month by setting the override, with the month and dollar amount:

```sh
aws ssm put-parameter --name /ahara/arconis/relay-budget-override --type String \
  --overwrite --value 2026-11=25
```

The value lapses when the month ends. Spend figures are cached for a few minutes in the Lambda.

## Costs

The instance and its disk bill only while running, and data transfer bills as used. Using existing hosting
and S3-managed encryption avoids adding a dedicated KMS key.
