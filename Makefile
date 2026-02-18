# CNEAv5 Neural Interfacing Platform - Development Makefile
# =========================================================

.PHONY: help build up down restart logs status clean \
        migrate shell test lint frontend-dev backend-dev \
        db-shell redis-cli seed backup

# Default target
help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
	awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Docker Compose ───────────────────────────────────────────────────
build:  ## Build all Docker images
	docker compose build

build-no-cache:  ## Build all Docker images without cache
	docker compose build --no-cache

up:  ## Start all services in detached mode
	docker compose up -d

up-logs:  ## Start all services with logs attached
	docker compose up

down:  ## Stop all services
	docker compose down

restart:  ## Restart all services
	docker compose restart

restart-backend:  ## Restart backend + agents only
	docker compose restart django data-acquisition signal-processing \
	  hardware-control storage ai-ml notification llm-agent

restart-frontend:  ## Restart frontend + BFF
	docker compose restart frontend bff

# ── Logs ─────────────────────────────────────────────────────────────
logs:  ## Follow all service logs
	docker compose logs -f

logs-backend:  ## Follow backend logs
	docker compose logs -f django

logs-agents:  ## Follow all agent logs
	docker compose logs -f data-acquisition signal-processing \
	  hardware-control storage ai-ml notification llm-agent

logs-frontend:  ## Follow frontend logs
	docker compose logs -f frontend bff

# ── Status ───────────────────────────────────────────────────────────
status:  ## Show service status
	docker compose ps

health:  ## Check health of all services
	@echo "=== Service Health ==="
	@docker compose ps --format "table {{.Name}}\t{{.Status}}"
	@echo ""
	@echo "=== Port Mappings ==="
	@docker compose ps --format "table {{.Name}}\t{{.Ports}}" | grep -v "^$$"

# ── Database ─────────────────────────────────────────────────────────
migrate:  ## Run Django database migrations
	docker compose exec django python manage.py migrate

makemigrations:  ## Create new migrations
	docker compose exec django python manage.py makemigrations

db-shell:  ## Open PostgreSQL shell
	docker compose exec postgres psql -U neural_admin -d neural_interface

db-reset:  ## Reset database (DESTRUCTIVE)
	@echo "WARNING: This will destroy all data. Press Ctrl+C to cancel."
	@sleep 3
	docker compose down -v
	docker compose up -d postgres
	@sleep 5
	docker compose up -d django
	docker compose exec django python manage.py migrate

# ── Redis ────────────────────────────────────────────────────────────
redis-cli:  ## Open Redis CLI
	docker compose exec redis redis-cli

redis-monitor:  ## Monitor Redis commands in real-time
	docker compose exec redis redis-cli monitor

# ── Django Management ────────────────────────────────────────────────
shell:  ## Open Django management shell
	docker compose exec django python manage.py shell

createsuperuser:  ## Create Django admin superuser
	docker compose exec django python manage.py createsuperuser

collectstatic:  ## Collect static files
	docker compose exec django python manage.py collectstatic --noinput

# ── Development ──────────────────────────────────────────────────────
frontend-dev:  ## Run frontend dev server locally (port 3025)
	cd frontend && npm install && npm run dev

backend-dev:  ## Run backend dev server locally (port 8085)
	cd backend && python manage.py runserver 0.0.0.0:8085

# ── Testing ──────────────────────────────────────────────────────────
test:  ## Run all Django tests
	docker compose exec django python manage.py test --verbosity=2

test-app:  ## Run tests for a specific app (e.g., make test-app APP=users)
	docker compose exec django python manage.py test apps.$(APP) --verbosity=2

lint:  ## Run linting on backend
	cd backend && python -m flake8 --max-line-length=120 --exclude=migrations .

# ── Cleanup ──────────────────────────────────────────────────────────
clean:  ## Stop services and remove volumes
	docker compose down -v --remove-orphans

prune:  ## Remove unused Docker resources
	docker system prune -f
	docker volume prune -f

# ── Backup ───────────────────────────────────────────────────────────
backup:  ## Backup PostgreSQL database
	@mkdir -p backups
	docker compose exec postgres pg_dump -U neural_admin neural_interface | \
	  gzip > backups/neural_interface_$$(date +%Y%m%d_%H%M%S).sql.gz
	@echo "Backup saved to backups/"

restore:  ## Restore from backup (e.g., make restore FILE=backups/file.sql.gz)
	@test -n "$(FILE)" || (echo "Usage: make restore FILE=backups/file.sql.gz" && exit 1)
	gunzip -c $(FILE) | docker compose exec -T postgres psql -U neural_admin neural_interface

# ── Seed Data ────────────────────────────────────────────────────────
seed:  ## Seed database with sample experiment data
	docker compose exec django python manage.py shell -c "\
	from apps.experiments.models import Experiment; \
	from apps.users.models import User; \
	admin = User.objects.first(); \
	if admin: \
	    Experiment.objects.get_or_create( \
	        name='Sample Experiment', \
	        defaults={'researcher': admin, 'status': 'idle', \
	                  'description': 'Auto-generated sample experiment'} \
	    ); \
	    print('Seed data created') \
	else: \
	    print('No admin user found - run make createsuperuser first')"
