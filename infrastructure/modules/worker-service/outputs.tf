output "service_id" {
  description = "The ID of the ECS service"
  value       = aws_ecs_service.worker.id
}

output "service_name" {
  description = "The name of the ECS service"
  value       = aws_ecs_service.worker.name
}

output "task_definition_arn" {
  description = "The ARN of the task definition"
  value       = aws_ecs_task_definition.worker.arn
}

output "security_group_id" {
  description = "The ID of the security group for the service"
  value       = aws_security_group.worker.id
}

output "security_group_arn" {
  description = "The ARN of the security group for the service"
  value       = aws_security_group.worker.arn
} 