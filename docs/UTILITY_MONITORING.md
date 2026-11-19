# Water and compressed air monitoring

Open `/water-monitoring` or `/compressed-air`. Add a meter, its location, and optional low-pressure / high-flow alarm thresholds. Meters start offline; no synthetic readings are inserted. Disable a meter to reject new readings. Deleting a meter also deletes its history, after confirmation in the UI.

## Units

| Measurement | Water | Compressed air |
| --- | --- | --- |
| `flowRate` | m³/h | Nm³/h |
| `totalVolume` | m³, cumulative counter | Nm³, cumulative counter |
| `pressureBar` | bar | bar |
| `temperatureC` | °C | °C |
| `powerKw` | omit | kW, optional compressor input power |

For air, configure the gateway and meter to use the same normal reference temperature and pressure. No automatic conversion between actual and normal volume is performed. Totalizers are individual cumulative counters, not daily consumption. Live flow sums only online meters and is meaningful only for independent branches; meters installed in series would double-count the same flow.

## MQTT

Run the existing broker and Worker using the same database as the API (`utility-system`). The Worker subscribes to the following new default topics; they can be enabled/disabled in MQTT configuration:

- `utility/water/+/telemetry`
- `utility/compressed-air/+/telemetry`

Register device `WM-01` before publishing to `utility/water/WM-01/telemetry`:

```json
{
  "timestamp": "2026-10-16T15:00:00+07:00",
  "flowRate": 12.5,
  "totalVolume": 1042.8,
  "pressureBar": 3.2,
  "temperatureC": 28.0
}
```

Register `AIR-01` and publish to `utility/compressed-air/AIR-01/telemetry`:

```json
{
  "timestamp": "2026-10-16T15:00:00+07:00",
  "flowRate": 280,
  "totalVolume": 42000,
  "pressureBar": 6.8,
  "temperatureC": 32,
  "powerKw": 45
}
```

Use the current measurement time with an explicit timezone. Timestamp, flow, and total volume are required. Unknown or disabled meters, malformed payloads, negative flow/volume/pressure/power, and timestamps over five minutes in the future are rejected. `(DeviceId, Timestamp)` is unique: duplicate deliveries do not create duplicate readings. Out-of-order history is retained without replacing a newer latest reading. UTC is stored and the browser displays local time. After 120 seconds without a fresh reading a meter is offline; the last reading is still visible and marked stale. Alarms evaluate only fresh readings with the relevant value present. High flow is an indication to investigate, not proof of a leak.

## Authenticated API

All endpoints require the existing Bearer JWT. `kind` is `water` or `compressed-air`:

- `GET /api/utilities/{kind}/devices`
- `POST /api/utilities/{kind}/devices`
- `PUT /api/utilities/{kind}/devices/{id}`
- `DELETE /api/utilities/{kind}/devices/{id}`
- `POST /api/utilities/{kind}/devices/{id}/telemetry` — same payload as MQTT, for authenticated integrations.
- `GET /api/utilities/{kind}/devices/{id}/history?start=<ISO time>&end=<ISO time>` — defaults to 24 hours, maximum range 31 days. Returns at most the latest 2,000 readings in ascending order plus `truncated`.

The API/Worker create `utility_types`, `utility_devices`, and `utility_readings` on first use. Meter type is held once in the catalog and referenced by meter; each reading references its meter. The database must already exist and the database account needs CREATE TABLE permission. Existing installations can apply `Backend/database/migrations/20261018_001_utility_type_catalog.sql` to add the type catalog foreign key.

## Verification

With the API running, execute `powershell -NoProfile -File scripts/test-utility-monitoring.ps1`. The script uses the documented demo account by default; override parameters as needed. It creates uniquely named test meters and deletes them in `finally`. Pass `-MqttPort <port>` with a running broker and Worker to also verify both MQTT ingestion paths.
