# HackTUES12

## Docker Quickstart

This project includes a Docker setup with:
- FastAPI web server
- MySQL 8 database
- Persistent MySQL storage via a named Docker volume

### 1. Create local environment file

Copy the template and adjust passwords/ports if needed:

```bash
cp .env.example .env
```

### 2. Build and start containers

```bash
docker compose up -d --build
```

Or with Make targets:

```bash
make rebuild
```

### 3. Verify services

Check running containers:

```bash
docker compose ps
```

Health check API:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"healthy"}
```

### 4. Useful commands

```bash
make logs     # Follow API logs
make ps       # Container status
make health   # API health check
make down     # Stop and remove containers
```

## Notes

- MySQL port 3306 is exposed on the host.
- Database data persists in the Docker volume: `hacktues12_mysql_data`.