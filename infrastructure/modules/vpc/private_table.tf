resource "aws_route_table" "private_route" {
  vpc_id = aws_vpc.main.id
  
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = {
    Name = "${var.project_name}-private-route-table"
  }
}

resource "aws_route_table_association" "sn_app_a" {
  subnet_id      = aws_subnet.sn_app_a.id
  route_table_id = aws_route_table.private_route.id
}

resource "aws_route_table_association" "sn_app_b" {
  subnet_id      = aws_subnet.sn_app_b.id
  route_table_id = aws_route_table.private_route.id
}

resource "aws_route_table_association" "sn_app_c" {
  subnet_id      = aws_subnet.sn_app_c.id
  route_table_id = aws_route_table.private_route.id
}

