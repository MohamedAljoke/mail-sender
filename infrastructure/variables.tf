variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "api_image_tag" {
  description = "The Docker image tag for the API service"
  type        = string
  default     = "latest"
}

variable "worker_image_tag" {
  description = "The Docker image tag for the Worker service"
  type        = string
  default     = "latest"
}