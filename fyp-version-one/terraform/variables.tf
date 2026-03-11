variable "aws_region" {
  description = "The AWS region to deploy resources into"
  type        = string
  default     = "eu-west-2"
}

variable "s3_bucket_name" {
  description = "Unique S3 bucket name for schedule storage"
  type        = string
  default     = "fyps-early-years-scheduler-2026" # change to a unique value if needed
}
