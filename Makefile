AWS_REGION ?= us-east-1
ENVIRONMENT ?= dev
PROJECT_NAME ?= task-manager

.PHONY: help plan deploy destroy ecr-login build-api build-worker push-api push-worker deploy
help: 
	@echo "  up            - Start all services with docker-compose"
	@echo "  down          - Stops all services with docker-compose"
	@echo "  tf-init       - init terraform  for infrastructure"
	@echo "  tf-plan       - Show terraform plan for infrastructure"
	@echo "  tf-deploy     - Deploy infrastructure to AWS"
	@echo "  tf-destroy    - Destroy infrastructure"
	@echo "  ecr-login     - Login to ECR"
	@echo "  build-api     - Build API Docker image"
	@echo "  build-worker  - Build Worker Docker image"
	@echo "  push-api      - Push API image to ECR"
	@echo "  push-worker   - Push Worker image to ECR" 
	@echo "  deploy        - Build, push images and update ECS services"
	@echo "  update-services - Force new deployment of ECS services"

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

ecr-login:
	aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(shell aws sts get-caller-identity --query Account --output text).dkr.ecr.$(AWS_REGION).amazonaws.com

build-api:
	docker build -t $(PROJECT_NAME)-api:latest -f services/api/dockerfile services/api/

build-worker:
	docker build -t $(PROJECT_NAME)-worker:latest -f services/worker/dockerfile services/worker/

push-api: build-api
	docker tag $(PROJECT_NAME)-api:latest $(shell aws sts get-caller-identity --query Account --output text).dkr.ecr.$(AWS_REGION).amazonaws.com/$(PROJECT_NAME)-api:latest
	docker push $(shell aws sts get-caller-identity --query Account --output text).dkr.ecr.$(AWS_REGION).amazonaws.com/$(PROJECT_NAME)-api:latest

push-worker: build-worker
	docker tag $(PROJECT_NAME)-worker:latest $(shell aws sts get-caller-identity --query Account --output text).dkr.ecr.$(AWS_REGION).amazonaws.com/$(PROJECT_NAME)-worker:latest
	docker push $(shell aws sts get-caller-identity --query Account --output text).dkr.ecr.$(AWS_REGION).amazonaws.com/$(PROJECT_NAME)-worker:latest

deploy: ecr-login push-api push-worker tf-deploy update-services
	@echo "Images pushed to ECR and services updated successfully!"

update-services:
	aws ecs update-service --cluster $(PROJECT_NAME)-cluster --service $(PROJECT_NAME)-api --force-new-deployment --region $(AWS_REGION)
	aws ecs update-service --cluster $(PROJECT_NAME)-cluster --service $(PROJECT_NAME)-worker --force-new-deployment --region $(AWS_REGION)