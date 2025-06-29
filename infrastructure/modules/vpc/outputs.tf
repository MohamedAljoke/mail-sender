output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}


output "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "vpc_ipv6_cidr_block" {
  description = "IPv6 CIDR block of the VPC"
  value       = aws_vpc.main.ipv6_cidr_block
}


output "web_subnet_ids" {
  description = "List of IDs of the web subnets"
  value       = [
    aws_subnet.sn_web_a.id,
    aws_subnet.sn_web_b.id,
    aws_subnet.sn_web_c.id
  ]
}

output "web_subnet_a_id" {
  description = "ID of the web subnet in AZ A"
  value       = aws_subnet.sn_web_a.id
}

output "web_subnet_b_id" {
  description = "ID of the web subnet in AZ B"
  value       = aws_subnet.sn_web_b.id
}

output "web_subnet_c_id" {
  description = "ID of the web subnet in AZ C"
  value       = aws_subnet.sn_web_c.id
}

# App Subnet Outputs (Private)
output "app_subnet_ids" {
  description = "List of IDs of the app subnets"
  value       = [
    aws_subnet.sn_app_a.id,
    aws_subnet.sn_app_b.id,
    aws_subnet.sn_app_c.id
  ]
}

output "app_subnet_a_id" {
  description = "ID of the app subnet in AZ A"
  value       = aws_subnet.sn_app_a.id
}

output "app_subnet_b_id" {
  description = "ID of the app subnet in AZ B"
  value       = aws_subnet.sn_app_b.id
}

output "app_subnet_c_id" {
  description = "ID of the app subnet in AZ C"
  value       = aws_subnet.sn_app_c.id
}

# Database Subnet Outputs (Isolated)
output "db_subnet_ids" {
  description = "List of IDs of the database subnets"
  value       = [
    aws_subnet.sn_db_a.id,
    aws_subnet.sn_db_b.id,
    aws_subnet.sn_db_c.id
  ]
}

output "db_subnet_a_id" {
  description = "ID of the database subnet in AZ A"
  value       = aws_subnet.sn_db_a.id
}

output "db_subnet_b_id" {
  description = "ID of the database subnet in AZ B"
  value       = aws_subnet.sn_db_b.id
}

output "db_subnet_c_id" {
  description = "ID of the database subnet in AZ C"
  value       = aws_subnet.sn_db_c.id
}

# Reserved Subnet Outputs
output "reserved_subnet_ids" {
  description = "List of IDs of the reserved subnets"
  value       = [
    aws_subnet.sn_reserved_a.id,
    aws_subnet.sn_reserved_b.id,
    aws_subnet.sn_reserved_c.id
  ]
}

output "reserved_subnet_a_id" {
  description = "ID of the reserved subnet in AZ A"
  value       = aws_subnet.sn_reserved_a.id
}

output "reserved_subnet_b_id" {
  description = "ID of the reserved subnet in AZ B"
  value       = aws_subnet.sn_reserved_b.id
}

output "reserved_subnet_c_id" {
  description = "ID of the reserved subnet in AZ C"
  value       = aws_subnet.sn_reserved_c.id
}

# Availability Zones
output "availability_zones" {
  description = "List of availability zones used"
  value       = [
    aws_subnet.sn_web_a.availability_zone,
    aws_subnet.sn_web_b.availability_zone,
    aws_subnet.sn_web_c.availability_zone
  ]
}

# Route Table Outputs
output "public_route_table_id" {
  description = "ID of the public route table"
  value       = aws_route_table.public_route.id
}

# Internet Gateway Output
output "internet_gateway_id" {
  description = "ID of the Internet Gateway"
  value       = aws_internet_gateway.main.id
}



output "private_route_table_id" {
  description = "ID of the private route table"
  value       = aws_route_table.private_route.id
}
# NAT Gateway Outputs
output "nat_gateway_id" {
  description = "ID of the NAT Gateway"
  value       = aws_nat_gateway.main.id
}

output "nat_gateway_ip" {
  description = "Elastic IP address of the NAT Gateway"
  value       = aws_eip.nat.public_ip
}