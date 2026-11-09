# Guest feedback is private application storage, independent of disposable relay instances.
resource "aws_s3_bucket" "feedback" {
  bucket = "arconis-feedback-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "feedback" {
  bucket                  = aws_s3_bucket.feedback.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "feedback" {
  bucket = aws_s3_bucket.feedback.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Only the application's origin can make the checksum-bound screenshot PUT in a browser.
resource "aws_s3_bucket_cors_configuration" "feedback" {
  bucket = aws_s3_bucket.feedback.id
  cors_rule {
    allowed_origins = [local.site_origin]
    allowed_methods = ["PUT"]
    allowed_headers = ["content-type", "x-amz-checksum-sha256"]
    max_age_seconds = 300
  }
}

output "feedback_bucket" {
  value = aws_s3_bucket.feedback.id
}
