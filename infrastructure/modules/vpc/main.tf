resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr
  enable_dns_support = true
  enable_dns_hostnames = true
  assign_generated_ipv6_cidr_block = true
  tags = {
    Name = "${var.project_name}-vpc"
  }
}

# Subnet A
resource "aws_subnet" "sn_reserved_a" {
  vpc_id            = aws_vpc.main.id
  assign_ipv6_address_on_creation = true
  cidr_block        = "10.16.0.0/20"
  ipv6_cidr_block   = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, 0) 
  availability_zone = "us-east-1a"
  tags = {
    Name = "sn-reserved-A"
  }
}
resource "aws_subnet" "sn_db_a" {
  vpc_id            = aws_vpc.main.id
  assign_ipv6_address_on_creation = true
  cidr_block        = "10.16.16.0/20"
  ipv6_cidr_block   = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, 1) 
  availability_zone = "us-east-1a"

  tags = {
    Name = "sn-db-A"
  }
}

resource "aws_subnet" "sn_app_a" {
  vpc_id            = aws_vpc.main.id
  assign_ipv6_address_on_creation = true
  cidr_block        = "10.16.32.0/20"
  ipv6_cidr_block   = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, 2) 
  availability_zone = "us-east-1a"

  tags = {
    Name = "sn-app-A"
  }
}

resource "aws_subnet" "sn_web_a" {
  vpc_id            = aws_vpc.main.id
  assign_ipv6_address_on_creation = true
  map_public_ip_on_launch = true
  cidr_block        = "10.16.48.0/20"
  ipv6_cidr_block   = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, 3) 
  availability_zone = "us-east-1a"

  tags = {
    Name = "sn-web-A"
  }
}

# Subnet B
resource "aws_subnet" "sn_reserved_b" {
  vpc_id            = aws_vpc.main.id
  assign_ipv6_address_on_creation = true
  cidr_block        = "10.16.64.0/20"
  ipv6_cidr_block   = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, 4) 
  availability_zone = "us-east-1b"

  tags = {
    Name = "sn-reserved-B"
  }
}

resource "aws_subnet" "sn_db_b" {
  vpc_id            = aws_vpc.main.id
  assign_ipv6_address_on_creation = true
  cidr_block        = "10.16.80.0/20"
  ipv6_cidr_block   = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, 5) 
  availability_zone = "us-east-1b"

  tags = {
    Name = "sn-db-B"
  }
}

resource "aws_subnet" "sn_app_b" {
  vpc_id            = aws_vpc.main.id
  assign_ipv6_address_on_creation = true
  cidr_block        = "10.16.96.0/20"
  ipv6_cidr_block   = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, 6) 
  availability_zone = "us-east-1b"

  tags = {
    Name = "sn-app-B"
  }
}

resource "aws_subnet" "sn_web_b" {
  vpc_id            = aws_vpc.main.id
  assign_ipv6_address_on_creation = true
  cidr_block        = "10.16.112.0/20"
  ipv6_cidr_block   = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, 7) 
  availability_zone = "us-east-1b"
  map_public_ip_on_launch = true
  tags = {
    Name = "sn-web-B"
  }
}

# Subnet C
resource "aws_subnet" "sn_reserved_c" {
  vpc_id            = aws_vpc.main.id
  assign_ipv6_address_on_creation = true
  cidr_block        = "10.16.128.0/20"
  ipv6_cidr_block   = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, 8) 
  availability_zone = "us-east-1c"

  tags = {
    Name = "sn-reserved-C"
  }
}

resource "aws_subnet" "sn_db_c" {
  vpc_id            = aws_vpc.main.id
  assign_ipv6_address_on_creation = true
  cidr_block        = "10.16.144.0/20"
  ipv6_cidr_block   = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, 9) 
  availability_zone = "us-east-1c"

  tags = {
    Name = "sn-db-C"
  }
}

resource "aws_subnet" "sn_app_c" {
  vpc_id            = aws_vpc.main.id
  assign_ipv6_address_on_creation = true
  cidr_block        = "10.16.160.0/20"
  ipv6_cidr_block   = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, 10) 
  availability_zone = "us-east-1c"

  tags = {
    Name = "sn-app-C"
  }
}

resource "aws_subnet" "sn_web_c" {
  vpc_id            = aws_vpc.main.id
  assign_ipv6_address_on_creation = true
  cidr_block        = "10.16.176.0/20"
  ipv6_cidr_block   = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, 11) 
  availability_zone = "us-east-1c"
  map_public_ip_on_launch = true
  tags = {
    Name = "sn-web-C"
  }
}
