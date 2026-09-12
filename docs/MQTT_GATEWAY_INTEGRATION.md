# MQTT Gateway Integration

This document defines the Gateway to Utility Monitoring integration contract for Power Monitoring.

## Architecture

```text
Schneider PM8000 / PM8240
  -> Gateway
  -> MQTT Broker
  -> Utility Monitoring Worker
  -> MySQL
  -> API / Dashboard
```

The gateway is responsible for mapping PM8000 Modbus registers into the Utility Monitoring MQTT payload. Utility Monitoring does not poll PM8000 meters and does not contain Schneider register addresses.

## MQTT Broker

Configure the gateway with the broker host, port, username, and password provided by the deployment owner. Credentials must not be embedded in frontend code or committed to source control.

Environment placeholders used by Utility Monitoring:

```text
MQTT_HOST
MQTT_PORT
MQTT_USERNAME
MQTT_PASSWORD
MQTT_CLIENT_ID
MQTT_TOPIC=utility/power/+/telemetry
```

## Topic Convention

```text
utility/power/{deviceCode}/telemetry
```

Examples:

```text
utility/power/PM-01/telemetry
utility/power/PM-06/telemetry
```

`deviceCode` must match a registered and enabled device in `power_devices`. Unknown devices are rejected and are not created automatically.

## Payload

Publish JSON using UTC ISO-8601 timestamps.

```json
{
  "deviceCode": "PM-01",
  "timestamp": "2026-09-12T06:30:00Z",
  "status": "online",
  "measurements": {
    "voltage": {
      "l1n": 230.1,
      "l2n": 229.8,
      "l3n": 230.5,
      "l1l2": 398.4,
      "l2l3": 399.1,
      "l3l1": 398.8
    },
    "current": {
      "l1": 42.3,
      "l2": 40.9,
      "l3": 41.7,
      "neutral": 2.1
    },
    "power": {
      "active_kw": 27.5,
      "reactive_kvar": 6.2,
      "apparent_kva": 28.2,
      "power_factor": 0.976
    },
    "frequency_hz": 50.01,
    "energy": {
      "import_kwh": 125430.5,
      "export_kwh": 120.3
    }
  }
}
```

Required fields:

- `deviceCode`: string, registered device code such as `PM-01`
- `timestamp`: UTC ISO-8601 timestamp
- `status`: `online`, `offline`, or `warning`
- `measurements`: object containing voltage, current, power, frequency, and energy

Units:

- Voltage: `V`
- Current: `A`
- Active power: `kW`
- Reactive power: `kVAR`
- Apparent power: `kVA`
- Frequency: `Hz`
- Energy: `kWh`

## Gateway Mapping Template

```text
SOURCE                     MQTT FIELD

PM8000 Voltage L1-N     -> measurements.voltage.l1n
PM8000 Voltage L2-N     -> measurements.voltage.l2n
PM8000 Voltage L3-N     -> measurements.voltage.l3n
PM8000 Voltage L1-L2    -> measurements.voltage.l1l2
PM8000 Voltage L2-L3    -> measurements.voltage.l2l3
PM8000 Voltage L3-L1    -> measurements.voltage.l3l1

PM8000 Current L1       -> measurements.current.l1
PM8000 Current L2       -> measurements.current.l2
PM8000 Current L3       -> measurements.current.l3
PM8000 Neutral Current  -> measurements.current.neutral

PM8000 Active Power     -> measurements.power.active_kw
PM8000 Reactive Power   -> measurements.power.reactive_kvar
PM8000 Apparent Power   -> measurements.power.apparent_kva
PM8000 Power Factor     -> measurements.power.power_factor

PM8000 Frequency        -> measurements.frequency_hz
PM8000 Import Energy    -> measurements.energy.import_kwh
PM8000 Export Energy    -> measurements.energy.export_kwh
```

Use the official Schneider PM8000 / PM8240 documentation for actual register addresses and scaling in the gateway configuration.

## Device Onboarding

1. In Utility Monitoring, open `Devices`.
2. Add the device code, name, model, location, gateway ID, and MQTT topic.
3. Configure the gateway to publish the same device code and topic.
4. The dashboard shows the device offline until the first valid telemetry arrives.
5. After valid telemetry arrives, the backend updates `last_seen`, latest telemetry, history, and dashboard status.

## Error Handling

Utility Monitoring safely ignores:

- Malformed JSON
- Unknown `deviceCode`
- Disabled devices
- Missing `timestamp`
- Missing `measurements`
- Non-numeric measurement values

One invalid message must not stop processing for other devices.

## Testing

Run the simulator:

```powershell
dotnet run --project Backend\PowerMqttSimulator\PowerMqttSimulator.csproj
```

Verify:

- `power_devices.last_seen` updates
- `power_latest_telemetry` has one row per device
- `power_telemetry_history` receives append-only records
- Dashboard cards update without manual refresh
