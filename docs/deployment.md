# Deployment

Pushing to `main` runs `.github/workflows/ci.yml`, which calls the shared Ahara CI workflow.
It gates deployment on browser tests, lint, types and unit tests, then applies Terraform through
the shared OIDC route.

## Infrastructure

Ahara admission lives in `ahara-infra/infrastructure/terraform/control/project-arconis.tf`.
`infrastructure/terraform/` owns:

- The relay: an Auto Scaling group behind the shared ALB at `relay.arconis.ahara.io`, its
  S3 bucket of relay code, and its security group and role.
- The control Lambda behind `/control/*`, `/mcp` and protected-resource discovery on the same host,
  and its SSM parameters. MCP requests forward through the ALB to `/mcp/relay`; WebSocket traffic
  continues directly to the relay.
- Arconis in the shared Ahara Auth0 tenant (`auth0.tf`): its database connection, the site's
  application and the accounts API it is granted, the MCP API with its default grant for registered
  connectors, the client that deletes users, and the post-login Action. The provider reads Ahara's credential from
  `/ahara/auth0/*`; the tenant, its branding and `auth.ahara.io` belong to ahara-infra.
- Accounts: a DynamoDB table, a private bucket of saved workspaces, and the API behind `/api/*` on the
  relay's host, whose ALB rule validates Auth0 tokens for the accounts API.
- Agents: the relay executes MCP at `/mcp/relay` and reads the tenant's issuer from its boot script, and the website's
  runtime configuration names the MCP address for the account panel.
- The website, through Ahara's `website` module: private S3 with S3-managed encryption, behind
  CloudFront and ACM TLS, at `arconis.ahara.io`.
- Runtime configuration, delivered to browsers as `config.js`.
- Feedback: a separate private, S3-encrypted bucket, `arconis-feedback-<account-id>`, with public
  access blocked. The existing control Lambda accepts guest reports through `/control/feedback`
  and issues checksum-bound screenshot PUTs through `/control/feedback/upload`; it never provides
  read or listing URLs. Feedback remains available while the relay is stopped.

State uses the shared bucket at `projects/arconis.tfstate`.

Run infrastructure deployment through the shared CI/CD workflow. Local validation builds and
test fixtures exercise application behavior without deploying or calling real AWS services.
The [development guide](development.md) lists those checks.

Each feedback submission occupies `submissions/<feedback-id>/report.json` in the feedback bucket,
plus `canvas.png` when the person opted in. The JSON includes client diagnostics and the server's
receipt timestamp. S3 tags identify the project, report kind, app revision, room type and whether
a screenshot is attached; report object metadata includes the feedback id and receipt time. Screenshots
use the normal PNG export, including its editable canvas copy. Private storage is readable through
authorized AWS access; no public feedback browser is exposed. The `feedback_bucket` Terraform
output identifies the bucket. Report and screenshot content are excluded from application logs.

Instances are disposable, and replacing one loses nothing: usage comes from CloudWatch by group name,
alerts and limits are in SSM, pictures are in S3, and documents are in browsers. Agent sessions end
with the instance, and agents reconnect. A deployment that
changes the relay's code or boot script rolls the group, launching the replacement and waiting for it to
pass the ALB's health check before terminating the old instance. When the relay is off there is nothing
to roll, and the next start uses the new version.

## Operating the relay

The public MCP endpoint returns availability explanations while the relay is stopped, starting,
stopping or at its monthly spending limit. It does not start the relay automatically; open an
ordinary room and use its existing start control. Discovery and sign-in remain available while
the relay is stopped. Forwarding failures appear in the control Lambda's CloudWatch logs with
their error reference; relay execution failures appear in Loki as described below. Neither path
retries writes after a response is lost.

MCP tool and HTTP failures return an error reference. Search Grafana's Loki datasource with
`{service_name="arconis-relay"} |= "<error reference>"` to find the corresponding operation, exception
and stack. Expected language refusals are tool errors with recovery guidance; they are not server
faults. Relay log forwarding uses Alloy and the existing private Ahara gateway, whose address is
discovered by its `Name=ahara-reverse-proxy` tag. The gateway owns downstream ingest authentication.

MCP diagnostics include successful and refused tool calls, request status and duration, aborted
requests, and session creation/closure with its reason. Each JSON record includes a timestamp,
severity, service and process id. `requestId` follows asynchronous work through the HTTP request;
`callId` pairs a tool's start and outcome; `session` identifies its in-memory agent state. Creation
records map that diagnostic id to a hashed MCP `sessionTag` and hashed account/client tags. Raw session
headers, tokens, room codes, canvas text and tool arguments are excluded. A tool's `roomOpen` flag
shows whether the session retained an open room, including on a refusal. Expected refusals and HTTP
4xx responses are warnings; server failures are errors. Logging sink failures do not alter tool results.

In Loki, filter `{service_name="arconis-relay"} | json | session="<diagnostic id>"` to follow one
session, or `| requestId="<request id>"` for a request. Creation records with the same `actorTag` and
`clientTag` identify separate sessions belonging to the same caller. Filter `event="mcp_http_finished"`
for request statuses/durations and `event="tool_finished"` for domain outcomes, since a tool refusal
can return HTTP 200. Correlation values stay in the JSON, not Loki labels. These choices follow
[OpenTelemetry's log data model](https://opentelemetry.io/docs/specs/otel/logs/data-model/),
[OWASP's logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html),
and [Loki's label guidance](https://grafana.com/docs/loki/latest/get-started/labels/bp-labels/).

On a running relay instance, `journalctl -u arconis-relay.service --no-pager` reads the local fallback,
and `journalctl -u alloy --no-pager` diagnoses shipping failures. Read these through SSM when needed;
in this environment, run secret-backed CLI commands through `with-cred --`. Other installations use
their ordinary AWS credential environment. The local journal ends with the instance; check Loki for
older shipped errors. A deployment is needed before changes to reporting or Alloy reach a running relay.

For an authorized operational limit change, set the month-scoped override. Replace `YYYY-MM`
and `USD` below with the intended calendar month and amount:

```sh
aws ssm put-parameter --name /ahara/arconis/relay-budget-override --type String \
  --overwrite --value 'YYYY-MM=USD'
```

The value lapses when the month ends. Spend figures are cached for a few minutes in the Lambda.

## Costs

The instance and its disk bill only while running, and data transfer bills as used. Using existing hosting
and S3-managed encryption avoids adding a dedicated KMS key.
