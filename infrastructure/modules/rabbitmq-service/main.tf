# ECS Task Definition for RabbitMQ
resource "aws_ecs_task_definition" "rabbitmq" {
  family                   = "${var.project_name}-${var.service_name}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = var.task_execution_role_arn

  container_definitions = jsonencode([
    {
      name  = "${var.project_name}-${var.service_name}"
      image = "rabbitmq:3.13-management"
      
      portMappings = [
        {
          containerPort = 5672
          protocol      = "tcp"
        },
        {
          containerPort = 15672
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "RABBITMQ_DEFAULT_USER"
          value = "admin"
        },
        {
          name  = "RABBITMQ_DEFAULT_PASS"
          value = "password"
        },
        {
          name  = "RABBITMQ_ERLANG_COOKIE"
          value = "rabbitmq-cookie-secret"
        },
        {
          name  = "RABBITMQ_USE_LONGNAME"
          value = "true"
        },
        {
          name  = "RABBITMQ_NODE_TYPE"
          value = "stats"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = var.log_group_name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = var.service_name
        }
      }

      healthCheck = {
        command     = ["CMD", "rabbitmq-diagnostics", "ping"]
        interval    = 30
        timeout     = 10
        retries     = 5
        startPeriod = 120
      }
      
      mountPoints = [
        {
          sourceVolume  = "rabbitmq-data"
          containerPath = "/var/lib/rabbitmq"
          readOnly      = false
        }
      ]
      
      essential = true
      user = "0:0"
    }
  ])

  volume {
    name = "rabbitmq-data"
    
    efs_volume_configuration {
      file_system_id = var.efs_file_system_id
      root_directory = "/rabbitmq"
    }
  }

  tags = {
    Name        = "${var.project_name}-${var.service_name}-task"
    Environment = var.environment
    Service     = var.service_name
  }
}

# Security Group for RabbitMQ
resource "aws_security_group" "rabbitmq" {
  name_prefix = "${var.project_name}-${var.service_name}-"
  vpc_id      = var.vpc_id
  description = "Security group for ${var.project_name} ${var.service_name} ECS service"
 
  ingress {
    description = "Allow AMQP traffic from API and Worker"
    from_port   = 5672
    to_port     = 5672
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr_block]
  }

  ingress {
    description = "Allow Management UI traffic"
    from_port   = 15672
    to_port     = 15672
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

# ECS Service for RabbitMQ
resource "aws_ecs_service" "rabbitmq" {
  name            = "${var.project_name}-${var.service_name}"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.rabbitmq.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.rabbitmq.id]
    assign_public_ip = false
  }


  depends_on = [aws_ecs_task_definition.rabbitmq]

  tags = {
    Name        = "${var.project_name}-${var.service_name}"
    Environment = var.environment
    Service     = var.service_name
  }

  lifecycle {
    ignore_changes = [desired_count]  
  }
}

resource "aws_service_discovery_service" "redis" {
  name = var.service_name

  dns_config {
    namespace_id = var.service_discovery_namespace_id
    dns_records {
      ttl  = 10
      type = "A"
    }
    routing_policy = "MULTIVALUE"
  }

}