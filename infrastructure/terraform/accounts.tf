# Accounts: Auth0 holds Arconis's users (auth0.tf). This user pool only federates them, so the ALB
# can validate AWS-issued tokens. DynamoDB holds profiles and workspace records, and a private bucket
# holds the workspaces.

locals {
  # Claimed in the shared listener-priority table in ahara/INTEGRATION.md. Ahead of the relay's rule,
  # which matches everything else on this host.
  accounts_listener_priority = 409
  accounts_table_arn         = aws_dynamodb_table.accounts.arn
  workspaces_bucket          = "arconis-workspaces-${data.aws_caller_identity.current.account_id}"
  mcp_resource               = "https://${local.relay_hostname}/mcp"
  cognito_issuer             = "https://cognito-idp.us-east-1.amazonaws.com/${aws_cognito_user_pool.accounts.id}"
  cognito_domain             = "https://${aws_cognito_user_pool_domain.accounts.domain}.auth.us-east-1.amazoncognito.com"
  auth0_provider_name        = "Auth0"
  # Signing out leaves the pool, then Auth0, then returns to the site, so the next sign-in asks again.
  auth0_sign_out = "${local.auth0_sign_in}/v2/logout?client_id=${auth0_client.web.client_id}&returnTo=${urlencode("${local.site_origin}/")}"
  sign_out_url   = "${local.cognito_domain}/logout?client_id=${aws_cognito_user_pool_client.accounts.id}&logout_uri=${urlencode(local.auth0_sign_out)}"
}

# Nobody signs up here: every user arrives from Auth0.
resource "aws_cognito_user_pool" "accounts" {
  name                     = "arconis-accounts"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF"
  deletion_protection      = "ACTIVE"

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

resource "aws_cognito_user_pool_domain" "accounts" {
  domain                = "arconis-${data.aws_caller_identity.current.account_id}"
  user_pool_id          = aws_cognito_user_pool.accounts.id
  managed_login_version = 1
}

# Endpoints are given in full, so Cognito needs no discovery and matches Auth0's issuer exactly.
resource "aws_cognito_identity_provider" "auth0" {
  user_pool_id  = aws_cognito_user_pool.accounts.id
  provider_name = local.auth0_provider_name
  provider_type = "OIDC"

  provider_details = {
    client_id                 = auth0_client.web.client_id
    client_secret             = random_password.cognito_federation.result
    attributes_request_method = "GET"
    oidc_issuer               = local.auth0_issuer
    authorize_scopes          = "openid email profile"
    authorize_url             = "${local.auth0_sign_in}/authorize"
    token_url                 = "${local.auth0_sign_in}/oauth/token"
    attributes_url            = "${local.auth0_sign_in}/userinfo"
    jwks_uri                  = "${local.auth0_sign_in}/.well-known/jwks.json"
  }

  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    username       = "sub"
  }

  depends_on = [auth0_client_credentials.web]
}

# The site signs in with the authorization code flow and PKCE, sent straight on to Auth0.
resource "aws_cognito_user_pool_client" "accounts" {
  name                                 = "arconis-web"
  user_pool_id                         = aws_cognito_user_pool.accounts.id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = [aws_cognito_identity_provider.auth0.provider_name]
  callback_urls                        = ["${local.site_origin}/"]
  logout_urls                          = [local.auth0_sign_out]
  explicit_auth_flows                  = ["ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true
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
  # Deleting an account finds the person's Auth0 user from their pool user, then removes both.
  statement {
    actions   = ["cognito-idp:ListUsers", "cognito-idp:AdminDeleteUser"]
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

  environment = merge(local.lifecycle_secrets, {
    TABLE_NAME   = aws_dynamodb_table.accounts.name
    BUCKET_NAME  = aws_s3_bucket.workspaces.id
    USER_POOL_ID = aws_cognito_user_pool.accounts.id
    SITE_ORIGIN  = local.site_origin
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

# --- Daily maintenance: removes Auth0 accounts never activated, and publishes account counts ---

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

  environment = merge(local.lifecycle_secrets, {
    ALARM_TOPIC_ARN = nonsensitive(data.aws_ssm_parameter.alarm_topic.value)
  })

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
