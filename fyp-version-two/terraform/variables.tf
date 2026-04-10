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

variable "lambda_list_configs_function_name" {
  description = "Name of the Lambda that lists config IDs for an organisation"
  type        = string
  default     = "nursery-config-list"
}

variable "alb_ingress_cidrs" {
  description = "IPv4 CIDR ranges allowed to reach the ALB (set to Cloudflare ranges in production)"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "alb_ingress_ipv6_cidrs" {
  description = "IPv6 CIDR ranges allowed to reach the ALB (Cloudflare IPv6 ranges)"
  type        = list(string)
  default     = []
}

variable "alb_certificate_arn" {
  description = "ACM certificate ARN for HTTPS listener on ALB"
  type        = string
  default     = ""
}

variable "enable_waf" {
  description = "Enable WAF in front of ALB"
  type        = bool
  default     = true
}

variable "waf_rate_limit" {
  description = "Rate limit per 5-minute period per IP"
  type        = number
  default     = 2000
}

variable "jwt_secret_name" {
  description = "Name of Secrets Manager secret storing JWT secret string"
  type        = string
  default     = "nursery-app-jwt-secret"
}