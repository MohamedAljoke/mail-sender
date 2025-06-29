resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project_name}-${var.service_name}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = var.task_execution_role_arn
  container_definitions = jsonencode([
    {
      name  = "${var.project_name}-${var.service_name}"
      image = "${var.ecr_repository_url}:${var.image_tag}"
      
      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = var.environment_variables

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = var.log_group_name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = var.service_name
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:${var.container_port}/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
      essential = true
    }
  ])

  tags = {
    Name        = "${var.project_name}-${var.service_name}-task"
    Environment = var.environment
    Service     = var.service_name
  }
}
resource "aws_security_group" "api" {
  name_prefix = "${var.project_name}-${var.service_name}-"
  vpc_id      = var.vpc_id
  description = "Security group for ${var.project_name} ${var.service_name} ECS service"
 
  ingress {
    description     = "Allow traffic from ALB"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }
  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    description      = "Allow all outbound IPv6 traffic"
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    ipv6_cidr_blocks = ["::/0"]
  }
  tags = {
    Name        = "${var.project_name}-${var.service_name}-sg"
    Environment = var.environment
    Service     = var.service_name
  }
  lifecycle {
    create_before_destroy = true
  }
}
resource "aws_ecs_service" "api" {
  name            = "${var.project_name}-${var.service_name}"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "${var.project_name}-${var.service_name}"
    container_port   = var.container_port
  }

  depends_on = [aws_ecs_task_definition.api]

  tags = {
    Name        = "${var.project_name}-${var.service_name}"
    Environment = var.environment
    Service     = var.service_name
  }
  lifecycle {
    ignore_changes = [desired_count]  
  }
} 