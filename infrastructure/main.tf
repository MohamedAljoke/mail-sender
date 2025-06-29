module "vpc" {
  source = "./modules/vpc"
  project_name = local.project_name
}

# Service Discovery for internal service communication
resource "aws_service_discovery_private_dns_namespace" "main" {
  name = "${local.project_name}.local"
  vpc  = module.vpc.vpc_id
  
  tags = {
    Name = "${local.project_name}-service-discovery"
    Environment = var.environment
  }
}

module "ecs_cluster" {
  source = "./modules/ecs-cluster"
  project_name = local.project_name
  environment = var.environment
  vpc_id = module.vpc.vpc_id
  vpc_cidr_block = module.vpc.vpc_cidr_block
}

module "alb" {
  source = "./modules/alb"
  project_name = local.project_name
  environment = var.environment
  vpc_id = module.vpc.vpc_id
  public_subnet_ids = module.vpc.web_subnet_ids
  api_port = 3000
}

#ecr images
module "ecr_worker" {
  source = "./modules/ecr"
  project_name = local.project_name
  service_name = "worker"
  environment = var.environment
}

module "ecr_api" {
  source = "./modules/ecr"
  project_name = local.project_name
  service_name = "api"
  environment = var.environment
}

# services
module "worker_service" {
  source = "./modules/worker-service"
  project_name = local.project_name
  service_name = "worker"
  environment = var.environment
  cluster_id = module.ecs_cluster.cluster_id
  vpc_id = module.vpc.vpc_id
  public_subnet_ids = module.vpc.web_subnet_ids
  app_subnet_ids = module.vpc.app_subnet_ids
  private_subnet_ids = module.vpc.app_subnet_ids
  task_execution_role_arn = module.ecs_cluster.task_execution_role_arn
  log_group_name = module.ecs_cluster.log_group_name
  aws_region = var.aws_region
  ecr_repository_url = module.ecr_worker.repository_url
  image_tag = var.worker_image_tag
  container_port = 3002
  task_cpu = 256
  task_memory = 512
  desired_count = 1
  target_group_arn = module.alb.worker_target_group_arn
  environment_variables = [
    {
      name  = "PORT"
      value = "3002"
    },
    {
      name  = "RABBITMQ_URL"
      value = "amqp://admin:password@rabbitmq.${local.project_name}.local:5672"
    },
    {
      name  = "REDIS_URL"
      value = "redis://redis.${local.project_name}.local:6379"
    },
    {
      name  = "SMTP_HOST"
      value = "mailhog.${local.project_name}.local"
    },
    {
      name  = "SMTP_PORT"
      value = "1025"
    },
    {
      name  = "OTEL_EXPORTER_JAEGER_ENDPOINT"
      value = "http://jaeger.${local.project_name}.local:14268/api/traces"
    },
    {
      name  = "OTEL_SERVICE_NAME"
      value = "email-worker"
    },
    {
      name  = "OTEL_RESOURCE_ATTRIBUTES"
      value = "service.name=email-worker,service.version=1.0.0"
    }
  ]
}
module "api_service" {
  source = "./modules/api-service"
  project_name = local.project_name
  service_name = "api"
  environment = var.environment
  cluster_id = module.ecs_cluster.cluster_id
  vpc_id = module.vpc.vpc_id
  private_subnet_ids = module.vpc.app_subnet_ids 
  public_subnet_ids = module.vpc.app_subnet_ids
  app_subnet_ids = module.vpc.app_subnet_ids 
  task_execution_role_arn = module.ecs_cluster.task_execution_role_arn
  log_group_name = module.ecs_cluster.log_group_name
  aws_region = var.aws_region
  ecr_repository_url = module.ecr_api.repository_url
  image_tag = var.api_image_tag
  container_port = 3000
  task_cpu = 256
  task_memory = 512
  desired_count = 1
  alb_security_group_id = module.alb.alb_security_group_id
  target_group_arn = module.alb.api_target_group_arn
  
  # Environment variables for API service to connect to other services
  environment_variables = [
    {
      name  = "PORT"
      value = "3000"
    },
    {
      name  = "RABBITMQ_URL"
      value = "amqp://admin:password@rabbitmq.${local.project_name}.local:5672"
    },
    {
      name  = "REDIS_URL"
      value = "redis://redis.${local.project_name}.local:6379"
    },
    {
      name  = "NODE_ENV"
      value = "production"
    },
    {
      name  = "OTEL_EXPORTER_JAEGER_ENDPOINT"
      value = "http://jaeger.${local.project_name}.local:14268/api/traces"
    },
    {
      name  = "OTEL_SERVICE_NAME"
      value = "email-api"
    },
    {
      name  = "OTEL_RESOURCE_ATTRIBUTES"
      value = "service.name=email-api,service.version=1.0.0"
    }
  ]
}

# EFS for RabbitMQ persistent storage
resource "aws_efs_file_system" "rabbitmq" {
  creation_token = "${local.project_name}-rabbitmq-efs"
  
  performance_mode = "generalPurpose"
  throughput_mode  = "provisioned"
  provisioned_throughput_in_mibps = 50

  tags = {
    Name = "${local.project_name}-rabbitmq-efs"
    Environment = var.environment
  }
}

resource "aws_efs_mount_target" "rabbitmq" {
  count           = length(module.vpc.app_subnet_ids)
  file_system_id  = aws_efs_file_system.rabbitmq.id
  subnet_id       = module.vpc.app_subnet_ids[count.index]
  security_groups = [aws_security_group.efs_rabbitmq.id]
}

resource "aws_efs_access_point" "rabbitmq" {
  file_system_id = aws_efs_file_system.rabbitmq.id

  posix_user {
    gid = 0
    uid = 0
  }

  root_directory {
    path = "/rabbitmq"
    creation_info {
      owner_gid   = 0
      owner_uid   = 0
      permissions = "755"
    }
  }

  tags = {
    Name = "${local.project_name}-rabbitmq-access-point"
    Environment = var.environment
  }
}

resource "aws_security_group" "efs_rabbitmq" {
  name_prefix = "${local.project_name}-rabbitmq-efs-"
  vpc_id      = module.vpc.vpc_id
  description = "Security group for RabbitMQ EFS"


  ingress {
    description = "NFS traffic from private subnets"
    from_port   = 2049
    to_port     = 2049
    protocol    = "tcp"
    cidr_blocks = [module.vpc.vpc_cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.project_name}-rabbitmq-efs-sg"
    Environment = var.environment
  }

  lifecycle {
    create_before_destroy = true
  }
}

module "rabbitmq_service" {
  source = "./modules/rabbitmq-service"
  project_name = local.project_name
  service_name = "rabbitmq"
  environment = var.environment
  cluster_id = module.ecs_cluster.cluster_id
  vpc_id = module.vpc.vpc_id
  vpc_cidr_block = module.vpc.vpc_cidr_block
  private_subnet_ids = module.vpc.app_subnet_ids
  task_execution_role_arn = module.ecs_cluster.task_execution_role_arn
  log_group_name = module.ecs_cluster.log_group_name
  aws_region = var.aws_region
  task_cpu = 512
  task_memory = 1024
  desired_count = 1
  service_discovery_namespace_id = aws_service_discovery_private_dns_namespace.main.id
  efs_file_system_id = aws_efs_file_system.rabbitmq.id
  efs_access_point_id = aws_efs_access_point.rabbitmq.id
}

# Security group rule to allow RabbitMQ to access EFS
resource "aws_security_group_rule" "rabbitmq_to_efs" {
  type                     = "ingress"
  from_port                = 2049
  to_port                  = 2049
  protocol                 = "tcp"
  source_security_group_id = module.rabbitmq_service.security_group_id
  security_group_id        = aws_security_group.efs_rabbitmq.id
  description              = "Allow RabbitMQ tasks to access EFS"
}

module "mailhog_service" {
  source = "./modules/mailhog-service"
  project_name = local.project_name
  service_name = "mailhog"
  environment = var.environment
  cluster_id = module.ecs_cluster.cluster_id
  vpc_id = module.vpc.vpc_id
  private_subnet_ids = module.vpc.app_subnet_ids
  task_execution_role_arn = module.ecs_cluster.task_execution_role_arn
  log_group_name = module.ecs_cluster.log_group_name
  aws_region = var.aws_region
  task_cpu = 256
  task_memory = 512
  desired_count = 1
  alb_security_group_id = module.alb.alb_security_group_id
  target_group_arn = module.alb.mailhog_target_group_arn
  allowed_security_groups = [module.worker_service.security_group_id]
  service_discovery_namespace_id = aws_service_discovery_private_dns_namespace.main.id
}

module "redis_service" {
  source = "./modules/redis-service"
  project_name = local.project_name
  service_name = "redis"
  environment = var.environment
  cluster_id = module.ecs_cluster.cluster_id
  vpc_id = module.vpc.vpc_id
  vpc_cidr_block = module.vpc.vpc_cidr_block
  private_subnet_ids = module.vpc.app_subnet_ids
  task_execution_role_arn = module.ecs_cluster.task_execution_role_arn
  log_group_name = module.ecs_cluster.log_group_name
  aws_region = var.aws_region
  task_cpu = 256
  task_memory = 512
  desired_count = 1
  service_discovery_namespace_id = aws_service_discovery_private_dns_namespace.main.id
}

module "jaeger_service" {
  source = "./modules/jaeger-service"
  project_name = local.project_name
  service_name = "jaeger"
  environment = var.environment
  cluster_id = module.ecs_cluster.cluster_id
  vpc_id = module.vpc.vpc_id
  private_subnet_ids = module.vpc.app_subnet_ids
  task_execution_role_arn = module.ecs_cluster.task_execution_role_arn
  log_group_name = module.ecs_cluster.log_group_name
  aws_region = var.aws_region
  task_cpu = 512
  task_memory = 1024
  desired_count = 1
  alb_security_group_id = module.alb.alb_security_group_id
  target_group_arn = module.alb.jaeger_target_group_arn
  allowed_security_groups = [module.api_service.security_group_id, module.worker_service.security_group_id]
  service_discovery_namespace_id = aws_service_discovery_private_dns_namespace.main.id
}

