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

    cognitoUserPoolId = aws_cognito_user_pool.accounts.id
    cognitoClientId   = aws_cognito_user_pool_client.accounts.id
  }
}

output "url" { value = module.frontend.url }
output "relay_group" { value = aws_autoscaling_group.relay.name }
