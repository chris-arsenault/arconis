terraform {
  required_version = ">= 1.12"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.0"
    }
    auth0 = {
      source  = "auth0/auth0"
      version = "1.59.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
  backend "s3" {
    region       = "us-east-1"
    key          = "projects/arconis.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = "us-east-1"
  default_tags {
    tags = { Project = "arconis", ManagedBy = "Terraform" }
  }
}

module "frontend" {
  source         = "git::https://github.com/chris-arsenault/ahara-tf-patterns.git//modules/website?ref=34287b1925e1b5681281c1fb3ee9199211202ec9"
  prefix         = "arconis"
  hostname       = "arconis.ahara.io"
  site_directory = "${path.module}/../../frontend/dist"
  encrypt        = false
  runtime_config = {
    transport = "relay"
    relayUrl  = "https://${local.relay_hostname}"

    # Sign-in is the Ahara Auth0 tenant's, for the accounts API.
    authAuthority  = local.auth0_issuer
    authClientId   = auth0_client.web.client_id
    authAudience   = local.accounts_audience
    authSignOutUrl = local.sign_out_url

    # Shown to signed-in people so they can connect an agent.
    mcpUrl = local.mcp_resource
  }
}

output "url" { value = module.frontend.url }
output "relay_group" { value = aws_autoscaling_group.relay.name }
