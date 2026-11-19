# On-Premise Deployment

This project is intended to run against the on-premise MySQL database.

## Requirements

- Windows Server or Windows workstation
- .NET 8 Runtime or SDK
- Node.js 20+
- MySQL 8 at `127.0.0.1:3306`

## Database

Connection string:

```text
Server=127.0.0.1;Port=3306;User ID=root;Password=YOUR_PASSWORD;Database=utility-system;SslMode=None;AllowPublicKeyRetrieval=True;
```

Apply the schema:

```powershell
mysql -h 127.0.0.1 -P 3306 -u root -pYOUR_PASSWORD < Backend\database\utility-system.sql
```

For an existing database, run `Backend\database\migrations\20261018_001_utility_type_catalog.sql` after confirming `utility_devices.kind` contains only `water` or `compressed-air`.
Run `Backend\database\migrations\20261018_002_system_logo.sql` as well to enable the database stored application logo.

## API

```powershell
$env:ASPNETCORE_ENVIRONMENT="Development"
$env:ConnectionStrings__DefaultConnection="Server=127.0.0.1;Port=3306;User ID=root;Password=YOUR_PASSWORD;Database=utility-system;SslMode=None;AllowPublicKeyRetrieval=True;"
dotnet run --project Backend\Web.API\Web.API.csproj --urls http://localhost:5241
```

Swagger:

```text
http://localhost:5241/swagger
```

## Frontend

```powershell
Set-Location Frontend
npm install
$env:NEXT_PUBLIC_API_BASE_URL="http://localhost:5241"
npm run dev
```

Open:

```text
http://localhost:3000
```

## Docker VPS

Initial clone:

```bash
sudo mkdir -p /var/www/utility-system
sudo chown -R "$USER":"$USER" /var/www/utility-system
git clone https://github.com/YudaGuntoro/utility-system.git /var/www/utility-system
cd /var/www/utility-system
cp .env.example .env
nano .env
```

Required VPS `.env` values:

```env
FRONTEND_ORIGIN=https://utility.your-domain.com
FRONTEND_ORIGIN_ALT=http://127.0.0.1:8091
NEXT_PUBLIC_API_BASE_URL=
SERVER_API_BASE_URL=http://api:8080
FRONTEND_HOST_PORT=8091
API_HOST_PORT=5274
MYSQL_CONNECTION_STRING=Server=host.docker.internal;Port=3306;User ID=root;Password=YOUR_PASSWORD;Database=utility-system;SslMode=None;AllowPublicKeyRetrieval=True;
JWT_SIGNING_KEY=replace-with-a-long-random-utility-system-secret
SWAGGER_ENABLED=false
```

Deploy:

```bash
cd /var/www/utility-system
git pull --ff-only origin main
docker compose -f docker-compose.vps.yml --env-file .env up -d --build
docker compose -f docker-compose.vps.yml --env-file .env ps
```

Deploy with MQTT worker:

```bash
docker compose -f docker-compose.vps.yml --env-file .env --profile worker up -d --build
docker compose -f docker-compose.vps.yml --env-file .env --profile worker ps
```
