variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string
}

variable "vpc_id" {
  description = "The ID of the VPC"
  type        = string
}

variable "public_subnet_ids" {
  description = "List of public subnet IDs for the ALB"
  type        = list(string)
}

variable "api_port" {
  description = "The port the API service listens on"
  type        = number
  default     = 3000
}

variable "domain_name" {
  description = "Domain name for SSL certificate (optional - leave empty for development)"
  type        = string
  default     = ""
} 