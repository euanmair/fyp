# Provisioning terraform itself

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.92"
    }
  }
  # Currently on version 1.14.7
  required_version = ">= 1.10"
}
