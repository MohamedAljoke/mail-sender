output "alb_id" {
  description = "The ID of the Application Load Balancer"
  value       = aws_lb.main_load_balancer.id
}

output "alb_arn" {
  description = "The ARN of the Application Load Balancer"
  value       = aws_lb.main_load_balancer.arn
}


output "alb_zone_id" {
  description = "The canonical hosted zone ID of the Application Load Balancer"
  value       = aws_lb.main_load_balancer.zone_id
}

output "alb_security_group_id" {
  description = "The ID of the ALB security group"
  value       = aws_security_group.alb_sg.id
}

output "api_target_group_arn" {
  description = "The ARN of the API target group"
  value       = aws_lb_target_group.api.arn
}

output "api_target_group_name" {
  description = "The name of the API target group"
  value       = aws_lb_target_group.api.name
}

output "mailhog_target_group_arn" {
  description = "The ARN of the MailHog target group"
  value       = aws_lb_target_group.mailhog.arn
}

output "mailhog_target_group_name" {
  description = "The name of the MailHog target group"
  value       = aws_lb_target_group.mailhog.name
}

output "worker_target_group_arn" {
  description = "The ARN of the Worker target group"
  value       = aws_lb_target_group.worker.arn
}

output "worker_target_group_name" {
  description = "The name of the Worker target group"
  value       = aws_lb_target_group.worker.name
}

output "rabbitmq_target_group_arn" {
  description = "The ARN of the RabbitMQ target group"
  value       = aws_lb_target_group.rabbitmq.arn
}

output "rabbitmq_target_group_name" {
  description = "The name of the RabbitMQ target group"
  value       = aws_lb_target_group.rabbitmq.name
} 