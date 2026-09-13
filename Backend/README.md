# Utility Monitoring Backend

Layered .NET 8 backend for Utility Monitoring Power Monitoring.

## Projects

- `Web.API`: ASP.NET Core Web API.
- `Web.API.Domain`: authentication, response, and power domain models.
- `Web.API.Persistence`: EF Core context and auth services.
- `Worker`: MQTT subscriber, telemetry writer, and optional continuous dummy publisher.
- `PowerMqttSimulator`: development MQTT telemetry simulator.

## Database

Use MySQL database `utility-system`.

```text
Server=127.0.0.1;Port=3306;User ID=root;Password=YOUR_PASSWORD;Database=utility-system;SslMode=None;AllowPublicKeyRetrieval=True;
```

Bootstrap:

```text
Backend/database/bajatitian-shms.sql
```

## API Modules

- `POST /api/auth/login`
- `GET /api/power/dashboard`
- `GET|POST /api/power/devices`
- `GET|PUT|DELETE /api/power/devices/{id}`
- `GET /api/power/devices/{id}/history`
- `GET /api/shms-system/mqtt-broker/status`

## Run

```powershell
$env:ConnectionStrings__DefaultConnection="Server=127.0.0.1;Port=3306;User ID=root;Password=YOUR_PASSWORD;Database=utility-system;SslMode=None;AllowPublicKeyRetrieval=True;"
dotnet run --project Web.API\Web.API.csproj --urls http://localhost:5241
```

Worker with continuous dummy MQTT publishing:

```powershell
$env:MQTT_HOST="broker.emqx.io"
$env:SIMULATOR_ENABLED="true"
$env:SIMULATOR_INTERVAL_SECONDS="5"
$env:SIMULATOR_DEVICES="PM-01,PM-02,PM-03"
dotnet run --project Worker\Worker.csproj
```
