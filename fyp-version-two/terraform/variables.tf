# Define variables for AWS region and S3 bucket name
variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "eu-north-1"
}

variable "s3_bucket_name" {
  description = "Define a unique S3 bucket name for schedule storage"
  type        = string
  default     = "fyp-early-years-scheduler-2026"
}
