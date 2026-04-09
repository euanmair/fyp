output "alb_dns_name" {
  description = "DNS name for the public-facing ALB"
  value       = aws_lb.frontend_alb.dns_name
}

output "app_target_group_arn" {
  description = "Target group ARN for the Next.js app"
  value       = aws_lb_target_group.app_tg.arn
}

output "jwt_secret_arn" {
  description = "Secrets Manager ARN used for JWT secret"
  value       = aws_secretsmanager_secret.jwt_secret.arn
}

output "waf_web_acl_arn" {
  description = "WAF Web ACL ARN when enabled"
  value       = var.enable_waf ? aws_wafv2_web_acl.frontend[0].arn : null
}
