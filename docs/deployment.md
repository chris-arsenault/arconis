# Deployment

Pushing to `main` runs `.github/workflows/ci.yml`, which calls the shared Ahara CI workflow.
It gates deployment on browser tests, lint, types and unit tests, then applies Terraform through
the shared OIDC route.

## Infrastructure

Ahara admission lives in `ahara-infra/infrastructure/terraform/control/project-arconis.tf`, and its
`appsync-events` permission primitive supports the service. `infrastructure/terraform/` owns:

- The AppSync Events API, its room namespace and the public API key.
- The website, through Ahara's `website` module: private S3 with S3-managed encryption, behind
  CloudFront and ACM TLS, at `arconis.ahara.io`.
- Runtime configuration, delivered to browsers as `config.js`.

State uses the shared bucket at `projects/arconis.tfstate`. Arconis registers no HTTP application API
or login client.

The API key's expiry extends from each Terraform deployment, so redeploy before it expires.

## Local deployment

Local deployment takes no parameters:

```sh
with-cred -- scripts/deploy.sh
```

`with-cred --` supplies authorized credentials in the broker environment. Other installations use
normal AWS environment variables or the standard credential provider chain.

## Costs

AppSync Events bills per operation and per connection minute, plus data transfer. See
[AWS pricing](https://aws.amazon.com/appsync/pricing/). Using existing hosting and S3-managed
encryption avoids adding a dedicated KMS key.
