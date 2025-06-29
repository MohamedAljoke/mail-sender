AWS_REGION ?= us-east-1
ENVIRONMENT ?= dev

.PHONY: help plan deploy destroy
help: 
	@echo "  up            - Start all services with docker-compose"
	@echo "  down          - Stops all services with docker-compose"
	@echo "  tf-init          - init terraform  for infrastructure"
	@echo "  tf-plan          - Show terraform plan for infrastructure"
	@echo "  tf-deploy        - Deploy infrastructure to AWS"
	@echo "  tf-destroy       - Destroy infrastructure"

down:
	docker-compose down

up:
	docker-compose up -d --build

tf-init:
	cd infrastructure && terraform init

tf-plan:
	cd infrastructure && terraform init && terraform plan

tf-deploy:
	cd infrastructure && terraform init && terraform apply -auto-approve

tf-destroy:
	cd infrastructure && terraform destroy -auto-approve