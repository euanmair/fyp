# --------------------------------------
# Configure AWS provider
# 23/03/2026 - Euan M
# --------------------------------------

provider "aws" {
  region = var.aws_region
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# --------------------------------------
# DynamoDB
# --------------------------------------
# DynamoDB table to store nursery schedules. Using on-demand billing for cost efficiency during development.
resource "aws_dynamodb_table" "NurserySchedules" {
  name           = "NurserySchedules"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "scheduleID"

  attribute {
    name = "scheduleID"
    type = "S"
  }

  attribute {
    name = "organisationID"
    type = "S"
  }

  attribute {
    name = "weekStartDate"
    type = "S"
  }

  global_secondary_index {
    name            = "OrgWeekIndex"
    hash_key        = "organisationID"
    range_key       = "weekStartDate"
    projection_type = "ALL"
  }

  tags = {
    Environment = "development"
    Owner       = "Euan"
    Application = "NurseryScheduleApp"
  }
}

# DynamoDB table to store history of schedule changes. This allows us to track changes over time and potentially implement features like undo or audit logs.
resource "aws_dynamodb_table" "NurseryScheduleHistory" {
  name           = "NurseryScheduleHistory"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "historyID"

  attribute {
    name = "historyID"
    type = "S"
  }

  tags = {
    Environment = "development"
    Owner       = "Euan"
    Application = "NurseryScheduleApp"
  }  
}

# DynamoDB table to store the nursery's default configuration (staff, settings, childrenCount, rooms).
# The Lambda reads from this table when no full payload is supplied so it can run without input every time.
resource "aws_dynamodb_table" "NurseryConfig" {
  name           = "NurseryConfig"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "configID"

  attribute {
    name = "configID"
    type = "S"
  }

  tags = {
    Environment = "development"
    Owner       = "Euan"
    Application = "NurseryScheduleApp"
  }
}

# DynamoDB table to store authentication users for Next.js login/registration.
resource "aws_dynamodb_table" "NurseryUsers" {
  name         = "NurseryUsers"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }

  tags = {
    Environment = "development"
    Owner       = "Euan"
    Application = "NurseryScheduleApp"
  }
}

resource "aws_dynamodb_table" "NurseryOrganisations" {
  name         = "NurseryOrganisations"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "organisationID"

  attribute {
    name = "organisationID"
    type = "S"
  }

  tags = {
    Environment = "development"
    Owner       = "Euan"
    Application = "NurseryScheduleApp"
  }
}

# Package the Lambda source directory, including dependencies installed in terraform/lambda/node_modules.
data "archive_file" "scheduler_lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambda"
  output_path = "${path.module}/lambda/scheduler_lambda.zip"
  excludes    = ["events", "package-lock.json"]
}

# Execution role assumed by the nursery scheduling Lambda function.
resource "aws_iam_role" "lambda_role" {
  name = "nursery-scheduler-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

# Attach the standard CloudWatch Logs permissions required by Lambda.
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# IAM 
resource "aws_iam_role_policy" "lambda_dynamodb_policy" {
  name = "lambda-dynamodb-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query"
        ]
        Resource = [
          aws_dynamodb_table.NurserySchedules.arn,
          "${aws_dynamodb_table.NurserySchedules.arn}/index/*",
          aws_dynamodb_table.NurseryScheduleHistory.arn,
          "${aws_dynamodb_table.NurseryScheduleHistory.arn}/index/*",
          aws_dynamodb_table.NurseryConfig.arn,
          aws_dynamodb_table.NurseryOrganisations.arn
        ]
      }
    ]
  })
}

# Execution role assumed by the EC2 instance running the Next.js app.
resource "aws_iam_role" "ec2_app_role" {
  name = "nursery-app-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "ec2_app_policy" {
  name = "nursery-app-ec2-policy"
  role = aws_iam_role.ec2_app_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.NurseryUsers.arn,
          aws_dynamodb_table.NurseryOrganisations.arn,
          aws_dynamodb_table.NurserySchedules.arn,
          "${aws_dynamodb_table.NurserySchedules.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = [
          aws_lambda_function.nursery_scheduler.arn,
          aws_lambda_function.nursery_config_get.arn,
          aws_lambda_function.nursery_config_upsert.arn,
          aws_lambda_function.nursery_config_patch.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.jwt_secret.arn
        ]
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2_app_profile" {
  name = "nursery-app-ec2-profile"
  role = aws_iam_role.ec2_app_role.name
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = var.jwt_secret_name
  description             = "JWT secret consumed by the Next.js app"
  recovery_window_in_days = 0
}

# Nursery scheduling Lambda function.
resource "aws_lambda_function" "nursery_scheduler" {
  function_name    = var.lambda_function_name
  role             = aws_iam_role.lambda_role.arn
  runtime          = "nodejs20.x"
  handler          = "index_prod.handler"
  filename         = data.archive_file.scheduler_lambda_zip.output_path
  source_code_hash = data.archive_file.scheduler_lambda_zip.output_base64sha256
  timeout          = 30
  memory_size      = 512

  environment {
    variables = {
      SCHEDULE_TABLE_NAME      = aws_dynamodb_table.NurserySchedules.name
      STAGE_HISTORY_TABLE_NAME = aws_dynamodb_table.NurseryScheduleHistory.name
      CONFIG_TABLE_NAME        = aws_dynamodb_table.NurseryConfig.name
      PERSIST_SCHEDULES        = tostring(var.persist_schedules)
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    aws_iam_role_policy.lambda_dynamodb_policy
  ]
}

# Lambda function for reading stored nursery config from DynamoDB.
resource "aws_lambda_function" "nursery_config_get" {
  function_name    = var.lambda_get_config_function_name
  role             = aws_iam_role.lambda_role.arn
  runtime          = "nodejs20.x"
  handler          = "index_prod.getNurseryConfigHandler"
  filename         = data.archive_file.scheduler_lambda_zip.output_path
  source_code_hash = data.archive_file.scheduler_lambda_zip.output_base64sha256
  timeout          = 30
  memory_size      = 512

  environment {
    variables = {
      SCHEDULE_TABLE_NAME      = aws_dynamodb_table.NurserySchedules.name
      STAGE_HISTORY_TABLE_NAME = aws_dynamodb_table.NurseryScheduleHistory.name
      CONFIG_TABLE_NAME        = aws_dynamodb_table.NurseryConfig.name
      PERSIST_SCHEDULES        = tostring(var.persist_schedules)
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    aws_iam_role_policy.lambda_dynamodb_policy
  ]
}

# Lambda function for creating/replacing nursery config in DynamoDB.
resource "aws_lambda_function" "nursery_config_upsert" {
  function_name    = var.lambda_upsert_config_function_name
  role             = aws_iam_role.lambda_role.arn
  runtime          = "nodejs20.x"
  handler          = "index_prod.upsertNurseryConfigHandler"
  filename         = data.archive_file.scheduler_lambda_zip.output_path
  source_code_hash = data.archive_file.scheduler_lambda_zip.output_base64sha256
  timeout          = 30
  memory_size      = 512

  environment {
    variables = {
      SCHEDULE_TABLE_NAME      = aws_dynamodb_table.NurserySchedules.name
      STAGE_HISTORY_TABLE_NAME = aws_dynamodb_table.NurseryScheduleHistory.name
      CONFIG_TABLE_NAME        = aws_dynamodb_table.NurseryConfig.name
      PERSIST_SCHEDULES        = tostring(var.persist_schedules)
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    aws_iam_role_policy.lambda_dynamodb_policy
  ]
}

# Lambda function for patching rooms/staff/settings/childrenCount in the stored config.
resource "aws_lambda_function" "nursery_config_patch" {
  function_name    = var.lambda_patch_config_function_name
  role             = aws_iam_role.lambda_role.arn
  runtime          = "nodejs20.x"
  handler          = "index_prod.patchNurseryConfigHandler"
  filename         = data.archive_file.scheduler_lambda_zip.output_path
  source_code_hash = data.archive_file.scheduler_lambda_zip.output_base64sha256
  timeout          = 30
  memory_size      = 512

  environment {
    variables = {
      SCHEDULE_TABLE_NAME      = aws_dynamodb_table.NurserySchedules.name
      STAGE_HISTORY_TABLE_NAME = aws_dynamodb_table.NurseryScheduleHistory.name
      CONFIG_TABLE_NAME        = aws_dynamodb_table.NurseryConfig.name
      PERSIST_SCHEDULES        = tostring(var.persist_schedules)
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    aws_iam_role_policy.lambda_dynamodb_policy
  ]
}

# --------------------------------------
# EC2
# --------------------------------------

# Fetch latest RedHat AMI
data "aws_ami" "redhat" {
  most_recent = true
  owners      = ["309956199498"] # RedHat's AWS account ID
  filter {
    name   = "image-id"
    values = ["ami-04c54313c5ae6bbcb*"]
    # AMI for RHEL 10 (HVM), SSD Volume Type - ami-04c54313c5ae6bbcb
  }
}

# Create an EC2 instance using the above RedHat AMI
resource "aws_instance" "app_server" {
  # EC2 Instance Parameters
  ami           = data.aws_ami.redhat.id
  # instance_type = "m7i-flex.large" # 2 vCPUs, 8 GiB RAM - $0.13 per/hour EU-NORTH-1
  instance_type = "t3.small" # 2 vCPUs, 2 GiB RAM - $0.0504 p/h EU-NORTH-1

  tags = {
    Name        = "AppServer"
    Environment = "development"
    Owner       = "Euan"
  }

  vpc_security_group_ids = [aws_security_group.app_sg.id]

  key_name = "euBusinessKey" # Ensure this key pair exists in the AWS account

  iam_instance_profile = aws_iam_instance_profile.ec2_app_profile.name

  credit_specification {
    cpu_credits = "standard"
  }

  # Define storage
  root_block_device {
    volume_size = 30 #GiB
    volume_type = "gp3"
    encrypted = false
  }

  # Bash script to install all necessary dependencies on the EC2 instance.
  # Clones GIT repository, starts application. 
  user_data = <<-EOF
    #!/bin/bash -ex
    # Redirect all output to a log file and also to the console for debugging
    exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1 

    # Treat all errors as fatal and print each command before executing it
    set -eux

    # Install Node.js, git and AWS CLI for Secrets Manager retrieval
    dnf update -y
    dnf install -y nodejs git awscli

    # Setup app directory
    mkdir -p /opt/app
    cd /opt/app

    # Pull application code from GitHub - CDing into correct dir
    git clone https://github.com/euanmair/fyp.git .
    cd fyp-version-two

    # Install application dependencies and start the app
    npm install
    npm run build

    JWT_SECRET_VALUE=$(aws secretsmanager get-secret-value --secret-id ${aws_secretsmanager_secret.jwt_secret.arn} --query SecretString --output text --region ${var.aws_region} 2>/dev/null || true)
    if [ -z "$JWT_SECRET_VALUE" ] || [ "$JWT_SECRET_VALUE" = "None" ]; then
      JWT_SECRET_VALUE="your-secret-key-change-in-production"
    fi

    # Create systemd service that points to this service. This will ensure the app starts on boot and restarts if it crashes.
    # This is done by writing all text below into nodeapp.service, until the SERVICE tag.
    cat >/etc/systemd/system/nodeapp.service <<SERVICE
    [Unit]
    Description=Next.js Web Application
    After=network.target

    [Service]
    WorkingDirectory=/opt/app/fyp-version-two
    ExecStart=/usr/bin/env HOST=0.0.0.0 PORT=3000 NODE_ENV=production npm run start
    Restart=always
    User=ec2-user
    Environment=NODE_ENV=production
    Environment=AWS_REGION=${var.aws_region}
    Environment=JWT_SECRET=$JWT_SECRET_VALUE

    [Install]
    WantedBy=multi-user.target
    SERVICE

    systemctl daemon-reload
    systemctl enable nodeapp
    systemctl start nodeapp

    # Set perms for app dir /opt/app/fyp-version-two
    chown ec2-user:ec2-user -R /opt/app/fyp-version-two
    # chmod 644 -R /opt/app/fyp-version-two

    # Deployments should be performed through CI/CD, not periodic force-reset jobs.
    # rm -f /etc/cron.d/repo-sync

  EOF
}

# --------------------------------------
# Define EC2 Params
# --------------------------------------

# Security group to allow SSH and HTTP access
resource "aws_security_group" "app_sg" {
  name        = "app_security_group"
  description = "Allow ALB to app and restricted SSH"

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_sg.id]
  }

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.my_pub_ip]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "alb_sg" {
  name        = "alb_security_group"
  description = "Public HTTP/HTTPS access for ALB"

  ingress {
    from_port        = 80
    to_port          = 80
    protocol         = "tcp"
    cidr_blocks      = var.alb_ingress_cidrs
    ipv6_cidr_blocks = var.alb_ingress_ipv6_cidrs
  }

  ingress {
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = var.alb_ingress_cidrs
    ipv6_cidr_blocks = var.alb_ingress_ipv6_cidrs
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }
}

resource "aws_lb" "frontend_alb" {
  name               = "nursery-frontend-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets            = data.aws_subnets.default.ids
}

resource "aws_lb_target_group" "app_tg" {
  name        = "nursery-app-tg"
  port        = 3000
  protocol    = "HTTP"
  target_type = "instance"
  vpc_id      = data.aws_vpc.default.id

  health_check {
    path                = "/"
    healthy_threshold   = 2
    unhealthy_threshold = 2
    interval            = 30
    timeout             = 5
    matcher             = "200-399"
  }
}

resource "aws_lb_target_group_attachment" "app_server_attachment" {
  target_group_arn = aws_lb_target_group.app_tg.arn
  target_id        = aws_instance.app_server.id
  port             = 3000
}

resource "aws_lb_listener" "http_redirect" {
  count             = var.alb_certificate_arn != "" ? 1 : 0
  load_balancer_arn = aws_lb.frontend_alb.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "http_plain" {
  count             = var.alb_certificate_arn == "" ? 1 : 0
  load_balancer_arn = aws_lb.frontend_alb.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app_tg.arn
  }
}

resource "aws_lb_listener" "https" {
  count             = var.alb_certificate_arn != "" ? 1 : 0
  load_balancer_arn = aws_lb.frontend_alb.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.alb_certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app_tg.arn
  }
}

resource "aws_wafv2_web_acl" "frontend" {
  count = var.enable_waf ? 1 : 0
  name  = "nursery-frontend-waf"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "aws-managed-common"
    priority = 1

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    override_action {
      none {}
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "awsManagedCommon"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "rate-limit"
    priority = 2

    statement {
      rate_based_statement {
        aggregate_key_type = "IP"
        limit              = var.waf_rate_limit
      }
    }

    action {
      block {}
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rateLimit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "frontendWaf"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "frontend_alb" {
  count        = var.enable_waf ? 1 : 0
  resource_arn = aws_lb.frontend_alb.arn
  web_acl_arn  = aws_wafv2_web_acl.frontend[0].arn
}

# Key Pair for SSH access
# resource "aws_key_pair" "app_key" {
#  key_name   = "euBusinessKey"
#  public_key = file("${path.module}/.ssh/euPubKey.pub") 
#}

