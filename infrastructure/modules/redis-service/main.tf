resource "aws_ecs_task_definition" "redis" {
  family                   = "${var.project_name}-${var.service_name}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = var.task_execution_role_arn

  container_definitions = jsonencode([
    {
      name  = "${var.project_name}-${var.service_name}"
      image = "redis:7-alpine"
      
      portMappings = [
        {
          containerPort = 6379
          protocol      = "tcp"
        }
      ]

      command = ["redis-server", "--appendonly", "yes"]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = var.log_group_name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = var.service_name
        }
      }

      healthCheck = {
        command     = ["CMD", "redis-cli", "ping"]
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

resource "aws_security_group" "redis" {
  name_prefix = "${var.project_name}-${var.service_name}-"
  vpc_id      = var.vpc_id
  description = "Security group for ${var.project_name} ${var.service_name} ECS service"
 
  ingress {
    description = "Allow Redis traffic from API and Worker"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr_block]
  }

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
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

resource "aws_ecs_service" "redis" {
  name            = "${var.project_name}-${var.service_name}"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.redis.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.redis.id]
    assign_public_ip = false
  }

  # Service Discovery Registration
  dynamic "service_registries" {
    for_each = var.service_discovery_arn != "" ? [1] : []
    content {
      registry_arn = var.service_discovery_arn
    }
  }

  depends_on = [aws_ecs_task_definition.redis]

  tags = {
    Name        = "${var.project_name}-${var.service_name}"
    Environment = var.environment
    Service     = var.service_name
  }

  lifecycle {
    ignore_changes = [desired_count]  
  }
}