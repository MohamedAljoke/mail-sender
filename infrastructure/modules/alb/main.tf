resource "aws_lb" "main_load_balancer" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = false

  tags = {
    Name        = "${var.project_name}-alb"
    Environment = var.environment
  }
}

resource "aws_security_group" "alb_sg" {
  name_prefix = "${var.project_name}-alb-"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  ingress {
    from_port   = 8025
    to_port     = 8025
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  ingress {
    from_port   = 15672
    to_port     = 15672
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  ingress {
    from_port   = 16686
    to_port     = 16686
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = {
    Name        = "${var.project_name}-alb-sg"
    Environment = var.environment
  }

}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main_load_balancer.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lb_listener" "mailhog" {
  load_balancer_arn = aws_lb.main_load_balancer.arn
  port              = "8025"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.mailhog.arn
  }
}

resource "aws_lb_listener" "rabbitmq" {
  load_balancer_arn = aws_lb.main_load_balancer.arn
  port              = "15672"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.rabbitmq.arn
  }
}

resource "aws_lb_listener" "jaeger" {
  load_balancer_arn = aws_lb.main_load_balancer.arn
  port              = "16686"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.jaeger.arn
  }
}

resource "aws_lb_target_group" "api" {
  name        = "${var.project_name}-api-tg"
  port        = var.api_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"
  
  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400 
    enabled         = true
  }

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/api/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name        = "${var.project_name}-api-tg"
    Environment = var.environment
  }
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}

resource "aws_lb_target_group" "mailhog" {
  name        = "${var.project_name}-mailhog-tg"
  port        = 8025
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name        = "${var.project_name}-mailhog-tg"
    Environment = var.environment
  }
}

resource "aws_lb_listener_rule" "mailhog" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 200

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.mailhog.arn
  }

  condition {
    path_pattern {
      values = ["/mailhog", "/mailhog/*"]
    }
  }
}

resource "aws_lb_target_group" "worker" {
  name        = "${var.project_name}-worker-tg"
  port        = 3002
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/worker/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name        = "${var.project_name}-worker-tg"
    Environment = var.environment
  }
}

resource "aws_lb_listener_rule" "worker" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 300

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.worker.arn
  }

  condition {
    path_pattern {
      values = ["/worker", "/worker/*"]
    }
  }
}

resource "aws_lb_target_group" "rabbitmq" {
  name        = "${var.project_name}-rabbitmq-tg"
  port        = 15672
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name        = "${var.project_name}-rabbitmq-tg"
    Environment = var.environment
  }
}

resource "aws_lb_listener_rule" "rabbitmq" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 400

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.rabbitmq.arn
  }

  condition {
    path_pattern {
      values = ["/rabbitmq", "/rabbitmq/*"]
    }
  }
}

resource "aws_lb_target_group" "jaeger" {
  name        = "${var.project_name}-jaeger-tg"
  port        = 16686
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name        = "${var.project_name}-jaeger-tg"
    Environment = var.environment
  }
}

resource "aws_lb_listener_rule" "jaeger" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 500

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.jaeger.arn
  }

  condition {
    path_pattern {
      values = ["/jaeger", "/jaeger/*"]
    }
  }
}
