# The relay: one stop-when-idle instance behind the shared ALB, plus a small Lambda that starts it
# and enforces the monthly limit. Follows the plain-instance pattern in ahara-infra's bastion and
# foundry-vtt: an ASG would treat the stopped instance as unhealthy and replace it.

locals {
  relay_hostname = "relay.arconis.ahara.io"
  relay_port     = 8080
  site_origin    = "https://arconis.ahara.io"
  ssm_prefix     = "/ahara/arconis"
  relay_bundle   = "${path.module}/../../frontend/dist-relay/server.cjs"

  # Claimed in the shared listener-priority table in ahara/INTEGRATION.md. The control rule sits
  # first so its paths reach the Lambda rather than the instance.
  control_listener_priority = 410
  relay_listener_priority   = 411

  # The relay normally stops itself when idle; this catches a hung process.
  max_uptime_minutes = 720
}

module "ctx" {
  source = "git::https://github.com/chris-arsenault/ahara-tf-patterns.git//modules/platform-context?ref=34287b1925e1b5681281c1fb3ee9199211202ec9"
}

data "aws_caller_identity" "current" {}

# The shared ALB security group is not exported by platform-context.
data "aws_security_group" "alb" {
  filter {
    name   = "tag:sg:role"
    values = ["alb"]
  }
  filter {
    name   = "tag:sg:scope"
    values = ["public"]
  }
}

data "aws_ssm_parameter" "alarm_topic" {
  name = "/ahara/alarms/sns-topic-arn"
}

# --- Relay code, fetched by the instance each time it boots ---

resource "aws_s3_bucket" "relay" {
  bucket = "arconis-relay-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "relay" {
  bucket                  = aws_s3_bucket.relay.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_object" "relay" {
  bucket = aws_s3_bucket.relay.id
  key    = "server.cjs"
  source = local.relay_bundle
  etag   = filemd5(local.relay_bundle)
}

# --- Instance ---

data "aws_ssm_parameter" "al2023_ami_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

data "aws_iam_policy_document" "assume_ec2" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "relay" {
  name               = "arconis-relay"
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
}

resource "aws_iam_instance_profile" "relay" {
  name = "arconis-relay"
  role = aws_iam_role.relay.name
}

resource "aws_iam_role_policy_attachment" "relay_ssm" {
  role       = aws_iam_role.relay.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "relay" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.relay.arn}/*"]
  }
}

resource "aws_iam_role_policy" "relay" {
  name   = "arconis-relay"
  role   = aws_iam_role.relay.id
  policy = data.aws_iam_policy_document.relay.json
}

# Inline rules: the deployer policy tag-scopes AuthorizeSecurityGroup*, which fails against the
# untagged rule ARNs that standalone rule resources create.
resource "aws_security_group" "relay" {
  name        = "arconis-relay-sg"
  description = "Arconis relay: WebSockets from the shared ALB only"
  vpc_id      = module.ctx.vpc.vpc_id

  ingress {
    description     = "Relay traffic from the shared ALB"
    from_port       = local.relay_port
    to_port         = local.relay_port
    protocol        = "tcp"
    security_groups = [data.aws_security_group.alb.id]
  }

  egress {
    description = "Outbound for packages, S3, SSM and the budget check"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "arconis-relay-sg" }
}

resource "aws_instance" "relay" {
  ami                                  = data.aws_ssm_parameter.al2023_ami_arm64.value
  instance_type                        = "c7g.medium"
  subnet_id                            = sort(module.ctx.vpc.private_subnet_ids)[0]
  vpc_security_group_ids               = [aws_security_group.relay.id]
  iam_instance_profile                 = aws_iam_instance_profile.relay.name
  instance_initiated_shutdown_behavior = "stop"
  user_data_replace_on_change          = true

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    encrypted   = true
    volume_size = 8
    volume_type = "gp3"
  }

  user_data_base64 = base64gzip(templatefile("${path.module}/templates/relay_user_data.sh.tpl", {
    bucket             = aws_s3_bucket.relay.id
    key                = aws_s3_object.relay.key
    port               = local.relay_port
    control_url        = "https://${local.relay_hostname}"
    allowed_origin     = local.site_origin
    max_uptime_minutes = local.max_uptime_minutes
  }))

  tags = { Name = "arconis-relay" }
}

# --- ALB: TLS, DNS and two rules ---

resource "aws_acm_certificate" "relay" {
  domain_name       = local.relay_hostname
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "relay_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.relay.domain_validation_options :
    dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }

  zone_id         = module.ctx.route53_zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.value]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "relay" {
  certificate_arn         = aws_acm_certificate.relay.arn
  validation_record_fqdns = [for record in aws_route53_record.relay_cert_validation : record.fqdn]
}

resource "aws_lb_listener_certificate" "relay" {
  listener_arn    = module.ctx.alb.listener_arn
  certificate_arn = aws_acm_certificate_validation.relay.certificate_arn
}

resource "aws_route53_record" "relay" {
  zone_id = module.ctx.route53_zone_id
  name    = local.relay_hostname
  type    = "A"

  alias {
    name                   = module.ctx.alb.dns_name
    zone_id                = module.ctx.alb.zone_id
    evaluate_target_health = false
  }
}

resource "aws_lb_target_group" "relay" {
  name                 = "arconis-relay-tg"
  port                 = local.relay_port
  protocol             = "HTTP"
  vpc_id               = module.ctx.vpc.vpc_id
  target_type          = "instance"
  deregistration_delay = 5

  # Short, because the first person waits on this after the instance boots.
  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 10
    timeout             = 5
    path                = "/health"
    matcher             = "200"
  }
}

resource "aws_lb_target_group_attachment" "relay" {
  target_group_arn = aws_lb_target_group.relay.arn
  target_id        = aws_instance.relay.id
  port             = local.relay_port
}

resource "aws_lb_listener_rule" "control" {
  listener_arn = module.ctx.alb.listener_arn
  priority     = local.control_listener_priority

  condition {
    host_header {
      values = [local.relay_hostname]
    }
  }
  condition {
    path_pattern {
      values = ["/control/*"]
    }
  }
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.control.arn
  }
}

resource "aws_lb_listener_rule" "relay" {
  listener_arn = module.ctx.alb.listener_arn
  priority     = local.relay_listener_priority

  condition {
    host_header {
      values = [local.relay_hostname]
    }
  }
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.relay.arn
  }
}

# --- Control Lambda ---

# The owner re-enables the relay within a month by setting this to, for example, 2026-11=25.
resource "aws_ssm_parameter" "budget_override" {
  name  = "${local.ssm_prefix}/relay-budget-override"
  type  = "String"
  value = "none"

  lifecycle {
    ignore_changes = [value]
  }
}

# The control Lambda records the last alert here, so each level alerts once a month.
resource "aws_ssm_parameter" "last_alert" {
  name  = "${local.ssm_prefix}/relay-last-alert"
  type  = "String"
  value = "none"

  lifecycle {
    ignore_changes = [value]
  }
}

data "aws_iam_policy_document" "assume_lambda" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "control" {
  name               = "arconis-control"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
}

resource "aws_iam_role_policy_attachment" "control_basic" {
  role       = aws_iam_role.control.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "control_vpc" {
  role       = aws_iam_role.control.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "control" {
  # Neither of these supports resource-level scoping.
  statement {
    actions   = ["ec2:DescribeInstances", "cloudwatch:GetMetricData"]
    resources = ["*"]
  }
  statement {
    actions   = ["ec2:StartInstances", "ec2:StopInstances"]
    resources = [aws_instance.relay.arn]
  }
  statement {
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.budget_override.arn, aws_ssm_parameter.last_alert.arn]
  }
  statement {
    actions   = ["ssm:PutParameter"]
    resources = [aws_ssm_parameter.last_alert.arn]
  }
  statement {
    actions   = ["sns:Publish"]
    resources = [nonsensitive(data.aws_ssm_parameter.alarm_topic.value)]
  }
}

resource "aws_iam_role_policy" "control" {
  name   = "arconis-control"
  role   = aws_iam_role.control.id
  policy = data.aws_iam_policy_document.control.json
}

data "archive_file" "control" {
  type        = "zip"
  source_dir  = "${path.module}/../../frontend/dist-relay/control"
  output_path = "${path.module}/../../frontend/dist-relay/control.zip"
}

module "control" {
  source       = "git::https://github.com/chris-arsenault/ahara-tf-patterns.git//modules/lambda?ref=34287b1925e1b5681281c1fb3ee9199211202ec9"
  name         = "arconis-control"
  package_file = data.archive_file.control.output_path
  runtime      = "nodejs24.x"
  handler      = "index.handler"
  role_arn     = aws_iam_role.control.arn
  vpc          = module.ctx.vpc
  timeout      = 10
  memory_size  = 256

  # Bounds what hostile traffic can cost: two at once, with spend reads cached in each.
  reserved_concurrent_executions = 2

  environment = {
    INSTANCE_ID        = aws_instance.relay.id
    SITE_ORIGIN        = local.site_origin
    OVERRIDE_PARAMETER = aws_ssm_parameter.budget_override.name
    ALERT_PARAMETER    = aws_ssm_parameter.last_alert.name
    ALARM_TOPIC_ARN    = nonsensitive(data.aws_ssm_parameter.alarm_topic.value)
  }

  depends_on = [aws_iam_role_policy.control, aws_iam_role_policy_attachment.control_vpc]
}

resource "aws_lb_target_group" "control" {
  name        = "arconis-control-tg"
  target_type = "lambda"
}

resource "aws_lambda_permission" "control" {
  statement_id  = "AllowALBInvoke"
  action        = "lambda:InvokeFunction"
  function_name = module.control.function_name
  principal     = "elasticloadbalancing.amazonaws.com"
  source_arn    = aws_lb_target_group.control.arn
}

resource "aws_lb_target_group_attachment" "control" {
  target_group_arn = aws_lb_target_group.control.arn
  target_id        = module.control.function_arn
  depends_on       = [aws_lambda_permission.control]
}
