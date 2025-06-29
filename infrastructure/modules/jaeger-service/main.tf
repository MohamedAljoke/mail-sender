# ECS Task Definition
resource "aws_ecs_task_definition" "jaeger" {
  family                   = "${var.project_name}-${var.service_name}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = var.task_execution_role_arn
  container_definitions = jsonencode([
    {
      name  = "${var.project_name}-${var.service_name}"
      image = "jaegertracing/all-in-one:1.58"
      
      portMappings = [
        {
          containerPort = 16686
          protocol      = "tcp"
        },
        {
          containerPort = 14268
          protocol      = "tcp"
        },
        {
          containerPort = 14250
          protocol      = "tcp"
        },
        {
          containerPort = 6831
          protocol      = "udp"
        },
        {
          containerPort = 6832
          protocol      = "udp"
        }
      ]

      environment = concat(var.environment_variables, [
        {
          name  = "COLLECTOR_OTLP_ENABLED"
          value = "true"
        }
      ])

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = var.log_group_name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = var.service_name
        }
      }

      healthCheck = {
        command     = ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:16686"]
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

# Security Group for the ECS Service
resource "aws_security_group" "jaeger" {
  name_prefix = "${var.project_name}-${var.service_name}-"
  vpc_id      = var.vpc_id
  description = "Security group for ${var.project_name} ${var.service_name} ECS service"
 
  ingress {
    description     = "Allow Jaeger UI traffic from ALB"
    from_port       = 16686
    to_port         = 16686
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  ingress {
    description     = "Allow Jaeger collector HTTP from services"
    from_port       = 14268
    to_port         = 14268
    protocol        = "tcp"
    security_groups = var.allowed_security_groups
  }

  ingress {
    description     = "Allow Jaeger collector gRPC from services"
    from_port       = 14250
    to_port         = 14250
    protocol        = "tcp"
    security_groups = var.allowed_security_groups
  }

  ingress {
    description     = "Allow Jaeger agent UDP from services"
    from_port       = 6831
    to_port         = 6832
    protocol        = "udp"
    security_groups = var.allowed_security_groups
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

# ECS Service
resource "aws_ecs_service" "jaeger" {
  name            = "${var.project_name}-${var.service_name}"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.jaeger.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.jaeger.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "${var.project_name}-${var.service_name}"
    container_port   = 16686
  }

  depends_on = [aws_ecs_task_definition.jaeger]

  tags = {
    Name        = "${var.project_name}-${var.service_name}"
    Environment = var.environment
    Service     = var.service_name
  }
  lifecycle {
    ignore_changes = [desired_count]  
  }

  service_registries {
    registry_arn = aws_service_discovery_service.jaeger.arn
  }
}

# Service Discovery
resource "aws_service_discovery_service" "jaeger" {
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