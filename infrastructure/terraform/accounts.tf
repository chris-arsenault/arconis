# Accounts: a user pool of Arconis's own with open sign-up, DynamoDB for everything Cognito does not
# hold, and a private bucket of workspaces that are encrypted before they reach it.

locals {
  # Claimed in the shared listener-priority table in ahara/INTEGRATION.md. Ahead of the relay's rule,
  # which matches everything else on this host.
  accounts_listener_priority = 409
  accounts_table_arn         = aws_dynamodb_table.accounts.arn
  workspaces_bucket          = "arconis-workspaces-${data.aws_caller_identity.current.account_id}"
}

resource "aws_cognito_user_pool" "accounts" {
  name                     = "arconis-accounts"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF"
  deletion_protection      = "ACTIVE"

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = false
    require_uppercase                = false
    require_numbers                  = false
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your Arconis activation code"
    email_message        = "Your Arconis activation code is {####}."
  }

  lambda_config {
    pre_sign_up = module.signup_limit.function_arn
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

# --- Agents: MCP clients sign in through the pool's own sign-in pages ---

locals {
  mcp_resource = "https://${local.relay_hostname}/mcp"
  # Where claude.ai and ChatGPT connectors return after sign-in. ChatGPT gives each connector its own
  # callback, shown when the connector is created; add each one here. Cognito matches exactly.
  agent_callback_urls = [
    "https://claude.ai/api/mcp/auth_callback",
  ]
}

resource "aws_cognito_user_pool_domain" "accounts" {
  domain                = "arconis-${data.aws_caller_identity.current.account_id}"
  user_pool_id          = aws_cognito_user_pool.accounts.id
  managed_login_version = 1
}

# A public client using the authorization code flow with PKCE. The relay accepts only this client's
# access tokens, and Cognito binds them to the MCP address when the agent asks for it.
resource "aws_cognito_user_pool_client" "agents" {
  name                                 = "arconis-agents"
  user_pool_id                         = aws_cognito_user_pool.accounts.id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = local.agent_callback_urls
  explicit_auth_flows                  = ["ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
  access_token_validity                = 1
  refresh_token_validity               = 30
  token_validity_units {
    access_token  = "hours"
    refresh_token = "days"
  }
}

# SRP only, so a password never leaves the browser. It also derives the key workspaces are encrypted with.
resource "aws_cognito_user_pool_client" "accounts" {
  name                          = "arconis-web"
  user_pool_id                  = aws_cognito_user_pool.accounts.id
  generate_secret               = false
  explicit_auth_flows           = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors = "ENABLED"
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
  statement {
    actions   = ["cognito-idp:AdminDeleteUser"]
    resources = [aws_cognito_user_pool.accounts.arn]
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

  environment = {
    TABLE_NAME   = aws_dynamodb_table.accounts.name
    BUCKET_NAME  = aws_s3_bucket.workspaces.id
    USER_POOL_ID = aws_cognito_user_pool.accounts.id
    SITE_ORIGIN  = local.site_origin
  }

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

# The ALB validates each token against this pool before the API sees the request.
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
      issuer        = "https://cognito-idp.us-east-1.amazonaws.com/${aws_cognito_user_pool.accounts.id}"
      jwks_endpoint = "https://cognito-idp.us-east-1.amazonaws.com/${aws_cognito_user_pool.accounts.id}/.well-known/jwks.json"
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.accounts.arn
  }
}

# --- Sign-up limit: Cognito asks this before creating an account ---

resource "aws_iam_role" "signup_limit" {
  name               = "arconis-signup-limit"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
}

resource "aws_iam_role_policy_attachment" "signup_limit_basic" {
  role       = aws_iam_role.signup_limit.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "signup_limit_vpc" {
  role       = aws_iam_role.signup_limit.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "signup_limit" {
  statement {
    actions   = ["dynamodb:UpdateItem"]
    resources = [local.accounts_table_arn]
  }
}

resource "aws_iam_role_policy" "signup_limit" {
  name   = "arconis-signup-limit"
  role   = aws_iam_role.signup_limit.id
  policy = data.aws_iam_policy_document.signup_limit.json
}

data "archive_file" "signup_limit" {
  type        = "zip"
  source_dir  = "${path.module}/../../frontend/dist-relay/signup-limit"
  output_path = "${path.module}/../../frontend/dist-relay/signup-limit.zip"
}

# Cognito stops waiting for a trigger after 5 seconds.
module "signup_limit" {
  source       = "git::https://github.com/chris-arsenault/ahara-tf-patterns.git//modules/lambda?ref=34287b1925e1b5681281c1fb3ee9199211202ec9"
  name         = "arconis-signup-limit"
  package_file = data.archive_file.signup_limit.output_path
  runtime      = "nodejs24.x"
  handler      = "index.handler"
  role_arn     = aws_iam_role.signup_limit.arn
  vpc          = module.ctx.vpc
  timeout      = 5
  memory_size  = 256

  reserved_concurrent_executions = 5

  environment = {
    TABLE_NAME = aws_dynamodb_table.accounts.name
  }

  depends_on = [aws_iam_role_policy.signup_limit, aws_iam_role_policy_attachment.signup_limit_vpc]
}

resource "aws_lambda_permission" "signup_limit" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = module.signup_limit.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.accounts.arn
}

# --- Daily maintenance: removes accounts never activated, and publishes account counts ---

resource "aws_iam_role" "maintenance" {
  name               = "arconis-maintenance"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
}

resource "aws_iam_role_policy_attachment" "maintenance_basic" {
  role       = aws_iam_role.maintenance.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "maintenance_vpc" {
  role       = aws_iam_role.maintenance.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "maintenance" {
  statement {
    actions   = ["cognito-idp:ListUsers", "cognito-idp:AdminDeleteUser"]
    resources = [aws_cognito_user_pool.accounts.arn]
  }
  statement {
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["Arconis/Accounts"]
    }
  }
  statement {
    actions   = ["sns:Publish"]
    resources = [nonsensitive(data.aws_ssm_parameter.alarm_topic.value)]
  }
}

resource "aws_iam_role_policy" "maintenance" {
  name   = "arconis-maintenance"
  role   = aws_iam_role.maintenance.id
  policy = data.aws_iam_policy_document.maintenance.json
}

data "archive_file" "maintenance" {
  type        = "zip"
  source_dir  = "${path.module}/../../frontend/dist-relay/maintenance"
  output_path = "${path.module}/../../frontend/dist-relay/maintenance.zip"
}

module "maintenance" {
  source       = "git::https://github.com/chris-arsenault/ahara-tf-patterns.git//modules/lambda?ref=34287b1925e1b5681281c1fb3ee9199211202ec9"
  name         = "arconis-maintenance"
  package_file = data.archive_file.maintenance.output_path
  runtime      = "nodejs24.x"
  handler      = "index.handler"
  role_arn     = aws_iam_role.maintenance.arn
  vpc          = module.ctx.vpc
  timeout      = 300
  memory_size  = 256

  environment = {
    USER_POOL_ID    = aws_cognito_user_pool.accounts.id
    ALARM_TOPIC_ARN = nonsensitive(data.aws_ssm_parameter.alarm_topic.value)
  }

  depends_on = [aws_iam_role_policy.maintenance, aws_iam_role_policy_attachment.maintenance_vpc]
}

data "aws_iam_policy_document" "assume_scheduler" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

# The `pipeline` name is what Ahara's scheduler permission allows a project to create.
resource "aws_scheduler_schedule_group" "maintenance" {
  name = "arconis-pipeline-maintenance"
}

resource "aws_iam_role" "maintenance_schedule" {
  name               = "arconis-pipeline-maintenance"
  assume_role_policy = data.aws_iam_policy_document.assume_scheduler.json
}

data "aws_iam_policy_document" "maintenance_schedule" {
  statement {
    actions   = ["lambda:InvokeFunction"]
    resources = [module.maintenance.function_arn]
  }
}

resource "aws_iam_role_policy" "maintenance_schedule" {
  name   = "arconis-pipeline-maintenance"
  role   = aws_iam_role.maintenance_schedule.id
  policy = data.aws_iam_policy_document.maintenance_schedule.json
}

resource "aws_scheduler_schedule" "maintenance" {
  name                = "arconis-maintenance"
  group_name          = aws_scheduler_schedule_group.maintenance.name
  schedule_expression = "rate(1 day)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = module.maintenance.function_arn
    role_arn = aws_iam_role.maintenance_schedule.arn
  }
}
