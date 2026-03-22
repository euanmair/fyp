# Configure AWS provider
provider "aws" {
    region = "eu-north-1"
}

# Fetch latest RedHat AMI
data "aws_ami" "redhat" {
    most_recent = true
    filter {
        name   = "name"
        values = ["ami-04c54313c5ae6bbcb"]
        # AMI for RHEL 10 (HVM), SSD Volume Type - ami-04c54313c5ae6bbcb
    }

    owners = ["309956199498"] # RedHat's AWS account ID
}

# Create an EC2 instance using the above RedHat AMI
resource "rh_instance" "app_server" {
    name = "app-server"
    image_id = data.aws_ami.redhat.id
    instance_type = "t3.micro"
  
    tags = {
        Name = "AppServer"
    }
}