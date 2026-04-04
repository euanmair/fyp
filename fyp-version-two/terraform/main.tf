# --------------------------------------
# Configure AWS provider
# 23/03/2026 - Euan M
# --------------------------------------

provider "aws" {
  region = var.aws_region
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
          aws_dynamodb_table.NurseryScheduleHistory.arn,
          "${aws_dynamodb_table.NurseryScheduleHistory.arn}/index/*",
          aws_dynamodb_table.NurseryConfig.arn
        ]
      }
    ]
  })
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

    # Install Node.js, git
    dnf update -y
    dnf install -y nodejs git

    # Setup app directory
    mkdir -p /opt/app
    cd /opt/app

    # Pull application code from GitHub - CDing into correct dir
    git clone https://github.com/euanmair/fyp.git .
    cd fyp-version-two

    # Install application dependencies and start the app
    npm install
    npm run build

    # Create systemd service that points to this service. This will ensure the app starts on boot and restarts if it crashes.
    # This is done by writing all text below into nodeapp.service, until the SERVICE tag.
    cat >/etc/systemd/system/nodeapp.service <<SERVICE
    [Unit]
    Description=Next.js Web Application
    After=network.target

    [Service]
    WorkingDirectory=/opt/app/fyp-version-two
    ExecStart=/usr/bin/env HOST=127.0.0.1 PORT=3000 npm run start
    Restart=always
    User=ec2-user
    Environment=NODE_ENV=development

    [Install]
    WantedBy=multi-user.target
    SERVICE

    systemctl daemon-reload
    systemctl enable nodeapp
    systemctl start nodeapp

    # Set perms for app dir /opt/app/fyp-version-two
    chown ec2-user:ec2-user -R /opt/app/fyp-version-two
    # chmod 644 -R /opt/app/fyp-version-two

    # Below cronjob is now confirmed working - Euan Mair 24/03/2026
    cat <<CRON >/etc/cron.d/repo-sync
    */5 * * * * root cd /opt/app/fyp-version-two && /usr/bin/git pull origin main && npm install && npm run build && systemctl restart nodeapp.service >> /var/log/repo-sync.log 2>&1
    CRON

    # Enabling & Restarting cron
    systemctl enable crond
    systemctl restart crond

  EOF
}

# --------------------------------------
# Define EC2 Params
# --------------------------------------

# Security group to allow SSH and HTTP access
resource "aws_security_group" "app_sg" {
  name        = "app_security_group"
  description = "Allow SSH only"

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

# Key Pair for SSH access
# resource "aws_key_pair" "app_key" {
#  key_name   = "euBusinessKey"
#  public_key = file("${path.module}/.ssh/euPubKey.pub") 
#}

