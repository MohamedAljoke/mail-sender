output "service_name" {
  description = "The name of the ECS service"
  value       = aws_ecs_service.mailhog.name
}

output "service_arn" {
  description = "The ARN of the ECS service"
  value       = aws_ecs_service.mailhog.id
}

output "task_definition_arn" {
  description = "The ARN of the task definition"
  value       = aws_ecs_task_definition.mailhog.arn
}

output "security_group_id" {
  description = "The ID of the security group"
  value       = aws_security_group.mailhog.id
}

output "service_discovery_service_arn" {
  description = "The ARN of the service discovery service"
  value       = aws_service_discovery_service.mailhog.arn
}