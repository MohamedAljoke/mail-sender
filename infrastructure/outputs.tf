output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.vpc.vpc_id
}

output "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  value       = module.vpc.vpc_cidr_block
}

output "db_subnet_ids" {
  description = "List of database subnet IDs"
  value       = module.vpc.db_subnet_ids
}

output "web_subnet_ids" {
  description = "List of web subnet IDs"
  value       = module.vpc.web_subnet_ids
}

output "app_subnet_ids" {
  description = "List of app subnet IDs"
  value       = module.vpc.app_subnet_ids
}

# ECR Repository outputs
output "api_ecr_repository_url" {
  description = "The URL of the API ECR repository"
  value       = module.ecr_api.repository_url
}

output "api_ecr_repository_name" {
  description = "The name of the API ECR repository"
  value       = module.ecr_api.repository_name
}

# ECS Cluster outputs
output "ecs_cluster_id" {
  description = "The ID of the ECS cluster"
  value       = module.ecs_cluster.cluster_id
}

output "ecs_cluster_name" {
  description = "The name of the ECS cluster"
  value       = module.ecs_cluster.cluster_name
}

output "ecs_cluster_arn" {
  description = "The ARN of the ECS cluster"
  value       = module.ecs_cluster.cluster_arn
}

output "ecs_task_execution_role_arn" {
  description = "The ARN of the ECS task execution role"
  value       = module.ecs_cluster.task_execution_role_arn
}

output "ecs_log_group_name" {
  description = "The name of the CloudWatch log group for ECS tasks"
  value       = module.ecs_cluster.log_group_name
}

# ALB outputs
output "alb_dns_name" {
  description = "The DNS name of the Application Load Balancer"
  value       = module.alb.alb_dns_name
}

output "alb_zone_id" {
  description = "The canonical hosted zone ID of the Application Load Balancer"
  value       = module.alb.alb_zone_id
}

# API Service outputs
output "api_service_id" {
  description = "The ID of the API ECS service"
  value       = module.api_service.service_id
}

output "api_service_name" {
  description = "The name of the API ECS service"
  value       = module.api_service.service_name
}

output "api_task_definition_arn" {
  description = "The ARN of the API task definition"
  value       = module.api_service.task_definition_arn
}

# Service Discovery outputs
output "service_discovery_namespace_id" {
  description = "The ID of the service discovery namespace"
  value       = aws_service_discovery_private_dns_namespace.main.id
}

output "service_discovery_namespace_name" {
  description = "The name of the service discovery namespace"
  value       = aws_service_discovery_private_dns_namespace.main.name
}

# Worker Service outputs
output "worker_ecr_repository_url" {
  description = "The URL of the Worker ECR repository"
  value       = module.ecr_worker.repository_url
}

output "worker_service_name" {
  description = "The name of the Worker ECS service"
  value       = module.worker_service.service_name
}

# Frontend URL outputs
output "frontend_url" {
  description = "The URL to access the frontend application"
  value       = "http://${module.alb.alb_dns_name}"
}

output "api_base_url" {
  description = "The base URL for API endpoints"
  value       = "http://${module.alb.alb_dns_name}/api"
}

output "websocket_url" {
  description = "The WebSocket URL for real-time updates"
  value       = "ws://${module.alb.alb_dns_name}/ws"
} 