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
  instance_type = "m7i-flex.large" # 2 vCPUs, 8 GiB RAM - £0.4 per/hour EU-NORTH-1

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

