# Device licensing

The capacity is the total number of rows in `power_devices`, `utility_devices` and `sensor_devices`, including disabled devices. Existing devices and telemetry remain available when no valid license is active; registering a new device requires a valid token with room available. The same limit applies to automatically registered MQTT sensors. Deleting a device releases its slot. Existing sample data counts too.

The installation ID is generated in the database and shown in **Settings → Device License**. An administrator sends this ID to the vendor and pastes the issued token into the same section. A token specifies the new total capacity, so an upgrade from 5 to 10 uses a token for 10, not 5. A token cannot reduce an active capacity or set a capacity below the number of registered devices. Licenses do not expire.

## Vendor: create keys and issue a token

Run these commands on a trusted vendor machine, never on a customer machine. Generate the key pair once and keep a secure backup of the private key. Never distribute the private key, commit it to source control, or include it in an application package. Rotating the keys invalidates previously issued tokens unless the old public key remains supported.

```powershell
dotnet run --project Backend/LicenseIssuer -- generate-keys C:\secure\issuer-private.pem C:\secure\issuer-public.pem
dotnet run --project Backend/LicenseIssuer -- issue C:\secure\issuer-private.pem INSTALLATION-GUID 10
```

Send the resulting token to the customer through the chosen sales/support channel. The issuer rejects existing key paths rather than overwriting keys. The token is RSA-PSS/SHA-256 signed; only the public key is required by the customer installation. The current tool issues tokens manually; it does not handle payment or integrate with a sales system.

## Customer deployment

Install the vendor's public PEM key on the server and configure the same absolute path in the API and worker process environments as `LICENSE_PUBLIC_KEY_PATH`. Restart both processes after configuration. If this variable is absent, the applications look for `.utility-monitoring-license/issuer-public.pem` in the service account's user profile. The API and worker can run as different accounts, so use the explicit environment variable for deployed services. Only the vendor should control which public key is trusted.

The license table is created automatically in the application database. Back up the database and installation ID. An installation ID is stored in the database; restoring or copying the database also copies the ID, so this offline scheme alone cannot prevent use of a cloned installation. Stronger clone protection requires an online activation service or additional deployment-specific binding. Customers with direct control of the server or database can modify an offline application; this mechanism is not tamper-proof against the server administrator.

Before enabling licensing for an existing installation, provision a token with capacity at least equal to its current device count. No active token blocks new registrations, not existing readings. API and worker must use the same database and trusted public key for consistent enforcement.
