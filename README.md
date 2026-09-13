# Utility Monitoring

Power Monitoring phase for Utility Monitoring. The app consumes normalized MQTT telemetry from a gateway, stores latest and historical readings in MySQL, and renders a dynamic dashboard for registered power meters.

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
mysql -u root -p -e "source Backend/database/bajatitian-shms.sql"
```

The script creates the auth tables, power tables, and seeds `PM-01` through `PM-05`. The API and worker also create the power tables and seed devices at startup if missing.

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
$env:SIMULATOR_INTERVAL_SECONDS="5"
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
- `GET /api/shms-system/mqtt-broker/status`

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
