AWS_REGION ?= us-east-1
ENVIRONMENT ?= dev

.PHONY: help
help: 
	@echo "  up            - Start all services with docker-compose"
	@echo "  down            - Stops all services with docker-compose"


down:
	docker-compose down

up:
	docker-compose up -d --build