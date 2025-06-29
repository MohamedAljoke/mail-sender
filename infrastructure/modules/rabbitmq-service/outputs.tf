output "service_name" {
  description = "The name of the RabbitMQ ECS service"
  value       = aws_ecs_service.rabbitmq.name
}

output "security_group_id" {
  description = "The ID of the RabbitMQ security group"
  value       = aws_security_group.rabbitmq.id
}

output "task_definition_arn" {
  description = "The ARN of the RabbitMQ task definition"
  value       = aws_ecs_task_definition.rabbitmq.arn
}