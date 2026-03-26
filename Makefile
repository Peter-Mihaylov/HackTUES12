COMPOSE ?= docker compose
SERVICE ?= api
API_PORT ?= 8001

.PHONY: help up down rebuild logs ps health restart

help:
	@echo "Available targets:"
	@echo "  make up       - Build and start the API container"
	@echo "  make down     - Stop and remove containers/network"
	@echo "  make rebuild  - Rebuild image and restart container"
	@echo "  make logs     - Follow API logs"
	@echo "  make ps       - Show container status"
	@echo "  make health   - Call health endpoint"
	@echo "  make restart  - Restart API service"

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

rebuild:
	$(COMPOSE) up -d --build

logs:
	$(COMPOSE) logs -f $(SERVICE)

ps:
	$(COMPOSE) ps

health:
	curl -fsS http://localhost:$(API_PORT)/health

restart:
	$(COMPOSE) restart $(SERVICE)