output "service_id" {
  description = "The ID of the ECS service"
  value       = aws_ecs_service.api.id
}

output "service_name" {
  description = "The name of the ECS service"
  value       = aws_ecs_service.api.name
}


output "task_definition_arn" {
  description = "The ARN of the task definition"
  value       = aws_ecs_task_definition.api.arn
}

output "security_group_id" {
  description = "The ID of the security group for the service"
  value       = aws_security_group.api.id
}

output "security_group_arn" {
  description = "The ARN of the security group for the service"
  value       = aws_security_group.api.arn
} 