locals {
  delivery_mcp_resource = "https://${local.relay_hostname}/delivery/mcp"
  delivery_mcp_scope    = "edit:delivery"
}

# Route only Delivery's unauthenticated discovery, credential metadata and bearer-checked MCP
# to the accounts Lambda. The browser and CLI API uses the existing JWT-validated /api rule.
resource "aws_lb_listener_rule" "delivery_mcp" {
  listener_arn = module.ctx.alb.listener_arn
  priority     = 408

  condition {
    host_header {
      values = [local.relay_hostname]
    }
  }

  condition {
    path_pattern {
      values = ["/delivery/mcp", "/delivery/cli", "/.well-known/oauth-protected-resource/delivery/mcp"]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.accounts.arn
  }
}

resource "auth0_resource_server" "delivery" {
  identifier           = local.delivery_mcp_resource
  name                 = "Arconis Delivery MCP"
  signing_alg          = "RS256"
  allow_offline_access = true

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

resource "auth0_resource_server_scopes" "delivery" {
  resource_server_identifier = auth0_resource_server.delivery.identifier

  scopes {
    name        = local.delivery_mcp_scope
    description = "Read and edit your Arconis Delivery projects"
  }
}

resource "auth0_client_grant" "delivery_third_party" {
  default_for  = "third_party_clients"
  audience     = auth0_resource_server.delivery.identifier
  scopes       = [local.delivery_mcp_scope]
  subject_type = "user"

  depends_on = [auth0_resource_server_scopes.delivery]
}

resource "auth0_client" "delivery_cli" {
  name            = "Arconis Delivery CLI"
  app_type        = "native"
  is_first_party  = true
  oidc_conformant = true
  grant_types     = ["urn:ietf:params:oauth:grant-type:device_code"]

  jwt_configuration {
    alg = "RS256"
  }
}

resource "auth0_client_credentials" "delivery_cli" {
  client_id             = auth0_client.delivery_cli.client_id
  authentication_method = "none"
}

resource "auth0_connection_client" "delivery_cli" {
  connection_id = data.auth0_connection.accounts.id
  client_id     = auth0_client.delivery_cli.client_id
}

resource "auth0_client_grant" "delivery_cli" {
  client_id    = auth0_client.delivery_cli.client_id
  audience     = auth0_resource_server.accounts.identifier
  scopes       = []
  subject_type = "user"
}
