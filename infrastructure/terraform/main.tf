terraform {
  required_version = ">= 1.12"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
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

resource "aws_appsync_api" "canvas" {
  name = "arconis-canvas"
  event_config {
    auth_provider { auth_type = "API_KEY" }
    connection_auth_mode { auth_type = "API_KEY" }
    default_publish_auth_mode { auth_type = "API_KEY" }
    default_subscribe_auth_mode { auth_type = "API_KEY" }
  }
}

resource "aws_appsync_channel_namespace" "rooms" {
  api_id = aws_appsync_api.canvas.api_id
  name   = "rooms"
}

resource "aws_appsync_api_key" "browser" {
  api_id      = aws_appsync_api.canvas.api_id
  description = "Public anonymous canvas client key"
  expires     = timeadd(plantimestamp(), "8640h")
}

module "frontend" {
  source         = "git::https://github.com/chris-arsenault/ahara-tf-patterns.git//modules/website?ref=34287b1925e1b5681281c1fb3ee9199211202ec9"
  prefix         = "arconis"
  hostname       = "arconis.ahara.io"
  site_directory = "${path.module}/../../frontend/dist"
  encrypt        = false
  runtime_config = {
    transport       = "appsync"
    appsyncHttp     = "https://${aws_appsync_api.canvas.dns["HTTP"]}/event"
    appsyncRealtime = "wss://${aws_appsync_api.canvas.dns["REALTIME"]}/event/realtime"
    appsyncApiKey   = aws_appsync_api_key.browser.key
  }
  depends_on = [aws_appsync_channel_namespace.rooms]
}

output "url" { value = module.frontend.url }
output "appsync_api_id" { value = aws_appsync_api.canvas.api_id }
