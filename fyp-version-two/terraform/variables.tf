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

variable "my_pub_ip" {
  description = "Your public IP address for SSH access to EC2 instance"
  type        = string
}

variable "lambda_function_name" {
  description = "Name of the nursery scheduling Lambda function"
  type        = string
  default     = "nursery-scheduler"
}

variable "persist_schedules" {
  description = "Whether the Lambda should persist generated schedules to DynamoDB by default"
  type        = bool
  default     = false
}

variable "lambda_get_config_function_name" {
  description = "Name of the Lambda that returns stored nursery config"
  type        = string
  default     = "nursery-config-get"
}

variable "lambda_upsert_config_function_name" {
  description = "Name of the Lambda that creates/replaces nursery config"
  type        = string
  default     = "nursery-config-upsert"
}

variable "lambda_patch_config_function_name" {
  description = "Name of the Lambda that patches rooms/staff/settings/children"
  type        = string
  default     = "nursery-config-patch"
}