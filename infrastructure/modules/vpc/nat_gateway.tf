resource "aws_eip" "nat" {
  domain = "vpc"
  depends_on = [aws_internet_gateway.main]
  tags = {
    Name = "${var.project_name}-nat-eip"
  }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.sn_web_a.id  # one point failure if you want better, needs more nat gateways
  depends_on    = [aws_internet_gateway.main]
  tags = {
    Name = "${var.project_name}-nat-gateway"
  }
}