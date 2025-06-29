variable "project_name" {
  description = "The name of the project"
  type        = string
}

variable "service_name" {
  description = "The name of the service"
  type        = string
  default     = "jaeger"
}

variable "environment" {
  description = "The deployment environment"
  type        = string
}

variable "vpc_id" {
  description = "The ID of the VPC"
  type        = string
}

variable "private_subnet_ids" {
  description = "The IDs of the private subnets"
  type        = list(string)
}

variable "cluster_id" {
  description = "The ID of the ECS cluster"
  type        = string
}

variable "task_execution_role_arn" {
  description = "The ARN of the task execution role"
  type        = string
}

variable "task_cpu" {
  description = "The CPU units for the task"
  type        = string
  default     = "512"
}

variable "task_memory" {
  description = "The memory for the task"
  type        = string
  default     = "1024"
}

variable "desired_count" {
  description = "The desired number of tasks"
  type        = number
  default     = 1
}

variable "log_group_name" {
  description = "The name of the CloudWatch log group"
  type        = string
}

variable "aws_region" {
  description = "The AWS region"
  type        = string
}

variable "alb_security_group_id" {
  description = "The security group ID of the ALB"
  type        = string
}

variable "allowed_security_groups" {
  description = "Security groups allowed to access Jaeger collector ports"
  type        = list(string)
  default     = []
}

variable "target_group_arn" {
  description = "The ARN of the target group for the load balancer"
  type        = string
}

variable "environment_variables" {
  description = "Environment variables for the container"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

variable "service_discovery_namespace_id" {
  description = "The ID of the service discovery namespace"
  type        = string
}