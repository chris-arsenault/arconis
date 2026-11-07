# Accounts: Auth0 holds Arconis's users (auth0.tf), and the ALB validates its tokens. DynamoDB holds
# profiles and workspace records, and a private bucket holds the workspaces.

locals {
  # Claimed in the shared listener-priority table in ahara/INTEGRATION.md. Ahead of the relay's rule,
  # which matches everything else on this host.
  accounts_listener_priority = 409
  accounts_table_arn         = aws_dynamodb_table.accounts.arn
  workspaces_bucket          = "arconis-workspaces-${data.aws_caller_identity.current.account_id}"
  mcp_resource               = "https://${local.relay_hostname}/mcp"
  accounts_audience          = "https://${local.relay_hostname}/api"
  # Signing out of Auth0 returns to the site, so the next sign-in asks again.
  sign_out_url = "${local.auth0_sign_in}/v2/logout?client_id=${auth0_client.web.client_id}&returnTo=${urlencode("${local.site_origin}/")}"
}

# The user pool Auth0 replaced. Deletion protection comes off first, so a later change can remove it.
resource "aws_cognito_user_pool" "accounts" {
  name                     = "arconis-accounts"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF"
  deletion_protection      = "INACTIVE"

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = false
    require_uppercase                = false
    require_numbers                  = false
    require_symbols                  = false
    temporary_password_validity_days = 7
  }
}

resource "aws_dynamodb_table" "accounts" {
  name         = "arconis-accounts"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_s3_bucket" "workspaces" {
  bucket = local.workspaces_bucket
}

resource "aws_s3_bucket_public_access_block" "workspaces" {
  bucket                  = aws_s3_bucket.workspaces.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Browsers upload and download directly, under links the accounts API signs.
resource "aws_s3_bucket_cors_configuration" "workspaces" {
  bucket = aws_s3_bucket.workspaces.id

  cors_rule {
    allowed_origins = [local.site_origin]
    allowed_methods = ["GET", "PUT"]
    allowed_headers = ["content-type", "x-amz-checksum-sha256"]
    max_age_seconds = 3000
  }
}

# --- API ---

resource "aws_iam_role" "accounts" {
  name               = "arconis-accounts"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
}

resource "aws_iam_role_policy_attachment" "accounts_basic" {
  role       = aws_iam_role.accounts.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "accounts_vpc" {
  role       = aws_iam_role.accounts.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "accounts" {
  statement {
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:ConditionCheckItem",
    ]
    resources = [local.accounts_table_arn]
  }
  # Signed links act with these permissions.
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.workspaces.arn}/workspaces/*"]
  }
}

resource "aws_iam_role_policy" "accounts" {
  name   = "arconis-accounts"
  role   = aws_iam_role.accounts.id
  policy = data.aws_iam_policy_document.accounts.json
}

data "archive_file" "accounts" {
  type        = "zip"
  source_dir  = "${path.module}/../../frontend/dist-relay/accounts"
  output_path = "${path.module}/../../frontend/dist-relay/accounts.zip"
}

module "accounts_api" {
  source       = "git::https://github.com/chris-arsenault/ahara-tf-patterns.git//modules/lambda?ref=34287b1925e1b5681281c1fb3ee9199211202ec9"
  name         = "arconis-accounts"
  package_file = data.archive_file.accounts.output_path
  runtime      = "nodejs24.x"
  handler      = "index.handler"
  role_arn     = aws_iam_role.accounts.arn
  vpc          = module.ctx.vpc
  timeout      = 10
  memory_size  = 256

  reserved_concurrent_executions = 5

  environment = merge(local.lifecycle_secrets, {
    TABLE_NAME  = aws_dynamodb_table.accounts.name
    BUCKET_NAME = aws_s3_bucket.workspaces.id
    SITE_ORIGIN = local.site_origin
  })

  depends_on = [aws_iam_role_policy.accounts, aws_iam_role_policy_attachment.accounts_vpc]
}

resource "aws_lb_target_group" "accounts" {
  name        = "arconis-accounts-tg"
  target_type = "lambda"
}

resource "aws_lambda_permission" "accounts" {
  statement_id  = "AllowALBInvoke"
  action        = "lambda:InvokeFunction"
  function_name = module.accounts_api.function_name
  principal     = "elasticloadbalancing.amazonaws.com"
  source_arn    = aws_lb_target_group.accounts.arn
}

resource "aws_lb_target_group_attachment" "accounts" {
  target_group_arn = aws_lb_target_group.accounts.arn
  target_id        = module.accounts_api.function_arn
  depends_on       = [aws_lambda_permission.accounts]
}

# The ALB validates each Auth0 token before the API sees the request, and only for this API: a
# connector's token for the MCP endpoint does not open it.
resource "aws_lb_listener_rule" "accounts" {
  listener_arn = module.ctx.alb.listener_arn
  priority     = local.accounts_listener_priority

  condition {
    host_header {
      values = [local.relay_hostname]
    }
  }
  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }

  action {
    type = "jwt-validation"

    jwt_validation {
      issuer        = local.auth0_issuer
      jwks_endpoint = "${local.auth0_sign_in}/.well-known/jwks.json"

      additional_claim {
        format = "string-array"
        name   = "aud"
        values = [local.accounts_audience]
      }
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.accounts.arn
  }
}
