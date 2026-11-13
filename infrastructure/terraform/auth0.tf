# Arconis in the shared Ahara Auth0 tenant (ahara/INTEGRATION.md, Step 6b). Ahara-infra owns the
# tenant, shared accounts and auth.ahara.io; this file owns Arconis's applications and APIs.
# The site signs people in here, and MCP connectors register themselves and sign in here too.

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
  auth0_issuer  = nonsensitive(data.aws_ssm_parameter.auth0_issuer.value)
  auth0_sign_in = trimsuffix(local.auth0_issuer, "/")
  mcp_scope     = "edit:rooms"
}

# Ahara adopts this existing database without moving users. Its internal name stays stable.
# A direct lookup lets this stack detach ownership before the platform publishes its SSM contract.
data "auth0_connection" "accounts" {
  name                 = "arconis"
  skip_enabled_clients = true
}

removed {
  from = auth0_connection.arconis
  lifecycle {
    destroy = false
  }
}

# --- People: the site signs in as a single-page application, with PKCE and rotating refresh tokens ---

resource "auth0_client" "web" {
  name                = "Arconis"
  description         = "The Arconis site."
  app_type            = "spa"
  is_first_party      = true
  oidc_conformant     = true
  grant_types         = ["authorization_code", "refresh_token"]
  callbacks           = ["${local.site_origin}/"]
  allowed_logout_urls = ["${local.site_origin}/"]
  web_origins         = [local.site_origin]
  allowed_origins     = [local.site_origin]

  jwt_configuration {
    alg = "RS256"
  }

  refresh_token {
    expiration_type = "expiring"
    rotation_type   = "rotating"
  }
}

resource "auth0_client_credentials" "web" {
  client_id             = auth0_client.web.client_id
  authentication_method = "none"
}

# The accounts API behind the ALB. Only the site is granted it.
resource "auth0_resource_server" "accounts" {
  identifier           = local.accounts_audience
  name                 = "Arconis accounts"
  signing_alg          = "RS256"
  allow_offline_access = true

  skip_consent_for_verifiable_first_party_clients = true
  subject_type_authorization {
    user {
      policy = "require_client_grant"
    }
    client {
      policy = "deny_all"
    }
  }
}

resource "auth0_client_grant" "web_accounts" {
  client_id    = auth0_client.web.client_id
  audience     = auth0_resource_server.accounts.identifier
  scopes       = []
  subject_type = "user"
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

removed {
  from = auth0_connection_clients.arconis
  lifecycle {
    destroy = false
  }
}

# Each application owns only its own association, so another product's access survives deploys.
import {
  to = auth0_connection_client.web
  id = "${data.auth0_connection.accounts.id}::${auth0_client.web.client_id}"
}

resource "auth0_connection_client" "web" {
  connection_id = data.auth0_connection.accounts.id
  client_id     = auth0_client.web.client_id
}
removed {
  from = auth0_action.require_activation
  lifecycle {
    destroy = false
  }
}

removed {
  from = auth0_trigger_action.require_activation
  lifecycle {
    destroy = false
  }
}
