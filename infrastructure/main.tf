module "vpc" {
  source = "./modules/vpc"
  project_name = local.project_name
}

# Service Discovery for internal service communication
resource "aws_service_discovery_private_dns_namespace" "main" {
  name = "${local.project_name}.local"
  vpc  = module.vpc.vpc_id
  
  tags = {
    Name = "${local.project_name}-service-discovery"
    Environment = var.environment
  }
}

module "alb" {
  source = "./modules/alb"
  project_name = local.project_name
  environment = var.environment
  vpc_id = module.vpc.vpc_id
  public_subnet_ids = module.vpc.web_subnet_ids
  api_port = 3000
}
