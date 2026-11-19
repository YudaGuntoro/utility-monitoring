# Utility Monitoring System

Water and compressed air modules are available alongside Power Monitoring. See [utility monitoring setup and MQTT payloads](docs/UTILITY_MONITORING.md).

For eight demo meters with seven days of history and live updates, see [demo data](docs/DEMO_DATA.md).

Utility Monitoring System monitors electricity, water, and compressed air. The app consumes MQTT telemetry from gateways, stores readings in MySQL, and provides dashboards, history, and configurable flow and pressure alarms.

## Architecture

```text
PM8000 -> Gateway -> MQTT Broker -> Worker MQTT Subscriber -> MySQL -> API -> Frontend
```

The gateway owns Modbus polling and PM8000 register mapping. Utility Monitoring only consumes the MQTT contract documented in `docs/MQTT_GATEWAY_INTEGRATION.md`.

## Requirements

- MySQL 8
- .NET 8 SDK
- Node.js/npm
- MQTT broker on port `1883`

Default demo login remains:

```text
Username: root
Password: root_native
```

## Database

Use database `utility-system`. From the repository root, run:

```powershell
mysql -u root -p -e "source Backend/database/utility-system.sql"
```

The script creates the normalized auth and utility catalog tables, plus power tables and `PM-01` through `PM-05`. Utility meter types live in `utility_types`; meters reference that catalog, and readings reference meters.

For an existing database, apply `Backend/database/migrations/20261018_001_utility_type_catalog.sql` after confirming meter kinds are `water` or `compressed-air`.

Application logo uploads are stored in `system_settings` and limited to 1 MB. Existing databases should also apply `Backend/database/migrations/20261018_002_system_logo.sql`.

## Run Locally

API:

```powershell
$env:ConnectionStrings__DefaultConnection="Server=127.0.0.1;Port=3306;User ID=root;Password=YOUR_PASSWORD;Database=utility-system;SslMode=None;AllowPublicKeyRetrieval=True;"
dotnet run --project Backend\Web.API\Web.API.csproj
```

Worker:

```powershell
$env:MQTT_HOST="127.0.0.1"
$env:MQTT_TOPIC="utility/power/+/telemetry"
$env:SIMULATOR_ENABLED="true"
$env:SIMULATOR_INTERVAL_SECONDS="1"
$env:SIMULATOR_DEVICES="PM-01,PM-02,PM-03"
dotnet run --project Backend\Worker\Worker.csproj
```

The Worker subscribes to `utility/power/+/telemetry` and, when `SIMULATOR_ENABLED=true`, continuously publishes dummy PM data to the same broker.

Frontend:

```powershell
Set-Location Frontend
npm install
$env:NEXT_PUBLIC_API_BASE_URL="http://localhost:5241"
npm run dev
```

Open `http://localhost:3000`.

## MQTT Simulator

```powershell
$env:MQTT_HOST="127.0.0.1"
dotnet run --project Backend\PowerMqttSimulator\PowerMqttSimulator.csproj
```

The simulator publishes `PM-01` through `PM-05` to `utility/power/{deviceCode}/telemetry`.

## Core API

- `POST /api/auth/login`
- `GET /api/power/dashboard`
- `GET|POST /api/power/devices`
- `GET|PUT|DELETE /api/power/devices/{id}`
- `GET /api/power/devices/{id}/history?start=...&end=...`
- `GET /api/utilities/{kind}/devices`

## Add PM-06

Open `Devices`, add:

```text
Device Code: PM-06
Name: Main Panel 06
Model: Schneider PM8240
Location: Electrical Room
Gateway ID: GW-01
MQTT Topic: utility/power/PM-06/telemetry
```

The dashboard will show PM-06 as offline until valid MQTT telemetry arrives.
