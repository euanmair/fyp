# Shared production-safe Terraform values.
# This file is tracked so EC2 instances pulling from GitHub receive these settings.

# Set ACM ARN to enable HTTPS listener and HTTP -> HTTPS redirect on ALB.
# Example: arn:aws:acm:eu-north-1:123456789012:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
alb_certificate_arn = ""

# Restrict ALB ingress to Cloudflare edge networks only.
alb_ingress_cidrs = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
]

alb_ingress_ipv6_cidrs = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
]

enable_waf     = true
waf_rate_limit = 1500
jwt_secret_name = "nursery-app-jwt-secret-v2"
