# --------------------------------------
# Configure AWS provider
# 23/03/2026 - Euan M
# --------------------------------------

provider "aws" {
  region = "eu-north-1"
}

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
  instance_type = "t3.micro"

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

  # Bash script to install all necessary dependencies on the EC2 instance.
  # Clones GIT repository, starts application. 
  user_data = <<-EOF
    #!/bin/bash
    
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
    cat >/etc/systemd/system/nodeapp.service <<SERVICE
    [Unit]
    Description=Next.js Web Application
    After=network.target

    [Service]
    WorkingDirectory=/opt/app/fyp-version-two
    ExecStart=/usr/bin/env HOST=127.0.01 PORT=3000 npm runstart
    Restart=always
    User=ec2-user
    Environment=NODE_ENV=development

    [Install]
    WantedBy=multi-user.target
    SERVICE

    systemctl daemon-reload
    systemctl enable nodeapp
    systemctl start nodeapp
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

