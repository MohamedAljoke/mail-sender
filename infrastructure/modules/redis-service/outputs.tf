output "service_name" {
  description = "The name of the Redis ECS service"
  value       = aws_ecs_service.redis.name
}

output "security_group_id" {
  description = "The ID of the Redis security group"
  value       = aws_security_group.redis.id
}

output "task_definition_arn" {
  description = "The ARN of the Redis task definition"
  value       = aws_ecs_task_definition.redis.arn
}