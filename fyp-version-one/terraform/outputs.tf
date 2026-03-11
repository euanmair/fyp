output "api_endpoint" {
  description = "Base URL for the HTTP API"
  value       = aws_apigatewayv2_api.http_api.api_endpoint
}

output "lambda_name" {
  description = "Deployed Lambda function name"
  value       = aws_lambda_function.scheduler.function_name
}

output "s3_bucket" {
  description = "S3 bucket name"
  value       = aws_s3_bucket.schedule_bucket.id
}
