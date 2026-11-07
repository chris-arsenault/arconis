# Arconis in the shared Ahara Auth0 tenant (ahara/INTEGRATION.md, Step 6b). Ahara-infra owns the
# tenant, its branding and auth.ahara.io; this file owns Arconis's users, applications and API.
# People sign in through Cognito, which federates this connection; MCP connectors sign in here
# directly and register themselves.

data "aws_ssm_parameter" "auth0_domain" {
  name = "/ahara/auth0/domain"
}

data "aws_ssm_parameter" "auth0_client_id" {
  name = "/ahara/auth0/client-id"
}

data "aws_ssm_parameter" "auth0_client_secret" {
  name = "/ahara/auth0/client-secret"
}

data "aws_ssm_parameter" "auth0_issuer" {
  name = "/ahara/auth0/issuer"
}

provider "auth0" {
  domain        = nonsensitive(data.aws_ssm_parameter.auth0_domain.value)
  client_id     = nonsensitive(data.aws_ssm_parameter.auth0_client_id.value)
  client_secret = data.aws_ssm_parameter.auth0_client_secret.value
}

locals {
  # The tenant's own domain answers the Management API; people and agents see auth.ahara.io.
  auth0_tenant_domain = nonsensitive(data.aws_ssm_parameter.auth0_domain.value)
  auth0_issuer        = nonsensitive(data.aws_ssm_parameter.auth0_issuer.value)
  auth0_sign_in       = trimsuffix(local.auth0_issuer, "/")
  mcp_scope           = "edit:rooms"
}

# Arconis's own users. Domain-level, so the MCP clients that register themselves can sign in here;
# no other product's connection is.
resource "auth0_connection" "arconis" {
  name                 = "arconis"
  display_name         = "Arconis"
  strategy             = "auth0"
  is_domain_connection = true

  options {
    disable_signup         = false
    requires_username      = false
    brute_force_protection = true
    password_policy        = "fair"

    password_complexity_options {
      min_length = 12
    }
  }
}

# --- People: Cognito signs them in through this application ---

resource "random_password" "cognito_federation" {
  length  = 64
  special = false
}

resource "auth0_client" "web" {
  name            = "Arconis"
  description     = "Arconis sign-in, federated into Arconis's Cognito user pool."
  app_type        = "regular_web"
  is_first_party  = true
  oidc_conformant = true
  grant_types     = ["authorization_code"]
  callbacks       = ["${local.cognito_domain}/oauth2/idpresponse"]
  # Where signing out of Auth0 returns.
  allowed_logout_urls = ["${local.site_origin}/"]

  jwt_configuration {
    alg = "RS256"
  }
}

# Cognito sends its secret in the request body.
resource "auth0_client_credentials" "web" {
  client_id             = auth0_client.web.client_id
  authentication_method = "client_secret_post"
  client_secret         = random_password.cognito_federation.result
}

# --- Agents: MCP clients register themselves and ask for this API by its address ---

resource "auth0_resource_server" "mcp" {
  identifier           = local.mcp_resource
  name                 = "Arconis MCP"
  signing_alg          = "RS256"
  allow_offline_access = true
  token_lifetime       = 86400

  # Registered clients are third-party; each must be granted, and people always see consent.
  skip_consent_for_verifiable_first_party_clients = false
  subject_type_authorization {
    user {
      policy = "require_client_grant"
    }
    client {
      policy = "deny_all"
    }
  }
}

resource "auth0_resource_server_scopes" "mcp" {
  resource_server_identifier = auth0_resource_server.mcp.identifier

  scopes {
    name        = local.mcp_scope
    description = "Read and edit the Arconis rooms you give it"
  }
}

# Every registered client may act for the person who signs in, and only on this API.
resource "auth0_client_grant" "mcp_third_party" {
  default_for  = "third_party_clients"
  audience     = auth0_resource_server.mcp.identifier
  scopes       = [local.mcp_scope]
  subject_type = "user"

  depends_on = [auth0_resource_server_scopes.mcp]
}

# --- Account lifecycle: the services that count, remove and delete Arconis's users ---

resource "random_password" "lifecycle" {
  length  = 64
  special = false
}

resource "auth0_client" "lifecycle" {
  name        = "Arconis accounts service"
  description = "Counts, removes and deletes Arconis's users."
  app_type    = "non_interactive"
  grant_types = ["client_credentials"]
}

resource "auth0_client_credentials" "lifecycle" {
  client_id             = auth0_client.lifecycle.client_id
  authentication_method = "client_secret_post"
  client_secret         = random_password.lifecycle.result
}

resource "auth0_client_grant" "lifecycle" {
  client_id = auth0_client.lifecycle.client_id
  audience  = "https://${local.auth0_tenant_domain}/api/v2/"
  scopes    = ["read:users", "delete:users"]
}

resource "auth0_connection_clients" "arconis" {
  connection_id   = auth0_connection.arconis.id
  enabled_clients = [auth0_client.web.client_id]
}

locals {
  lifecycle_secrets = {
    AUTH0_DOMAIN        = local.auth0_tenant_domain
    AUTH0_CLIENT_ID     = auth0_client.lifecycle.client_id
    AUTH0_CLIENT_SECRET = random_password.lifecycle.result
  }
}

# Actions run for the whole tenant, and act only on Arconis's connection. One bundle holds both
# entry points; each trigger calls its own.
locals {
  auth0_actions_bundle = "${path.module}/../../frontend/dist-relay/auth0-actions/index.js"
}

resource "auth0_action" "signup_limit" {
  name    = "arconis-signup-limit"
  runtime = "node22"
  deploy  = true
  code    = file(local.auth0_actions_bundle)

  supported_triggers {
    id      = "pre-user-registration"
    version = "v2"
  }

  dynamic "secrets" {
    for_each = local.lifecycle_secrets
    content {
      name  = secrets.key
      value = secrets.value
    }
  }
}

resource "auth0_trigger_action" "signup_limit" {
  trigger   = "pre-user-registration"
  action_id = auth0_action.signup_limit.id
}

resource "auth0_action" "require_activation" {
  name    = "arconis-require-activation"
  runtime = "node22"
  deploy  = true
  code    = file(local.auth0_actions_bundle)

  supported_triggers {
    id      = "post-login"
    version = "v3"
  }
}

resource "auth0_trigger_action" "require_activation" {
  trigger   = "post-login"
  action_id = auth0_action.require_activation.id
}
