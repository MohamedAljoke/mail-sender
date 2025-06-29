resource "aws_route_table" "public_route" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  route {
    ipv6_cidr_block  = "::/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.project_name}-route-table"
  }
}


//public subnets associations
resource "aws_route_table_association" "sn_web_a" {
  subnet_id      = aws_subnet.sn_web_a.id
  route_table_id = aws_route_table.public_route.id
}
resource "aws_route_table_association" "sn_web_b" {
  subnet_id      = aws_subnet.sn_web_b.id
  route_table_id = aws_route_table.public_route.id
}
resource "aws_route_table_association" "sn_web_c" {
  subnet_id      = aws_subnet.sn_web_c.id
  route_table_id = aws_route_table.public_route.id
}