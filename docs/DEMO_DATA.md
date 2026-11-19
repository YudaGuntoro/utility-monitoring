# Demo data

Start the API (`http://localhost:5241`), MQTT broker (`127.0.0.1:1883`), and Worker using the same database. Then run:

```powershell
node scripts/demo-telemetry.mjs --live
```

Without `--live`, the script seeds history and exits. With it, simulated readings update every 30 seconds until Ctrl+C. The frontend refreshes every 30 seconds. This is a local demo process; it does not install an auto-start service.

The script creates only clearly named `DEMO-*` devices. Existing devices and readings are retained. Existing demo devices with telemetry keep their history on subsequent runs. Newly created meters receive seven days of hourly history. Configure `DEMO_HISTORY_DAYS` (1–30), `DEMO_API_URL`, `DEMO_MQTT_HOST`, `DEMO_MQTT_PORT`, `DEMO_USERNAME`, or `DEMO_PASSWORD` through environment variables if needed. The default login is the repository's documented demo account; the MQTT publisher expects the local broker without authentication.

| Code | Description | Demo state |
| --- | --- | --- |
| DEMO-PM-01 | Production panel | Online |
| DEMO-PM-02 | HVAC panel | Online |
| DEMO-PM-03 | Compressor panel, reduced power factor | Warning |
| DEMO-WM-01 | Process water | Online |
| DEMO-WM-02 | Cooling tower, high flow | Warning during higher demand |
| DEMO-WM-03 | Reserve tank | Offline, last reading 45 minutes before seed time |
| DEMO-AIR-01 | Compressed air header A | Online |
| DEMO-AIR-02 | Compressed air header B, low pressure | Warning |

Power readings travel through MQTT → Worker → MySQL. Water and air readings use the authenticated telemetry API and the same validation/storage service used by their MQTT handlers. Values are simulated and are not suitable for real billing or efficiency conclusions. Once simulation stops, online meters become offline after their configured timeout; history remains available.

To remove a demo meter, delete its `DEMO-*` entry through Devices (Power) or the Water/Compressed Air page. Deleting a meter also removes its readings, so stop the simulator first.
