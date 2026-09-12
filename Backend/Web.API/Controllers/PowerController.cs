using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Web.API.Domain.Production;
using Web.API.Persistence.Context;

namespace Web.API.Controllers;

[ApiController]
[Route("api/power")]
public class PowerController : ApiControllerBase
{
    private const int DefaultOfflineTimeoutSeconds = 120;
    private readonly AppDbContext _db;

    public PowerController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet("devices")]
    public async Task<IActionResult> Devices(CancellationToken cancellationToken)
    {
        try
        {
            await EnsurePowerSchemaAsync(cancellationToken);
            await RefreshDeviceStatusesAsync(cancellationToken);
            var devices = await DeviceQuery()
                .OrderBy(x => x.DeviceCode)
                .ToListAsync(cancellationToken);
            return ApiOk(devices.Select(ToDeviceDto));
        }
        catch (Exception ex)
        {
            return ApiBadRequest(ex);
        }
    }

    [HttpGet("devices/{id:long}")]
    public async Task<IActionResult> Device(long id, CancellationToken cancellationToken)
    {
        try
        {
            await EnsurePowerSchemaAsync(cancellationToken);
            await RefreshDeviceStatusesAsync(cancellationToken);
            var device = await DeviceQuery().FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
            return device is null ? ApiNotFound("Power device not found.") : ApiOk(ToDeviceDto(device));
        }
        catch (Exception ex)
        {
            return ApiBadRequest(ex);
        }
    }

    [HttpPost("devices")]
    public async Task<IActionResult> CreateDevice([FromBody] UpsertPowerDeviceRequest request, CancellationToken cancellationToken)
    {
        try
        {
            await EnsurePowerSchemaAsync(cancellationToken);
            var deviceCode = NormalizeDeviceCode(request.DeviceCode);
            if (string.IsNullOrWhiteSpace(deviceCode))
            {
                throw new InvalidOperationException("Device Code is required.");
            }

            var exists = await _db.PowerDevices.AnyAsync(x => x.DeviceCode == deviceCode, cancellationToken);
            if (exists)
            {
                throw new InvalidOperationException($"Device Code {deviceCode} already exists.");
            }

            var now = DateTime.Now;
            var device = new PowerDevice
            {
                DeviceCode = deviceCode,
                Name = Clean(request.Name, $"Power Meter {deviceCode}"),
                Model = Clean(request.Model, "Schneider PM8000 / PM8240"),
                Location = Clean(request.Location),
                GatewayId = Clean(request.GatewayId),
                MqttTopic = Clean(request.MqttTopic, TopicFor(deviceCode)),
                Status = "offline",
                Enabled = request.Enabled,
                CreatedAt = now,
                UpdatedAt = now
            };
            _db.PowerDevices.Add(device);
            await _db.SaveChangesAsync(cancellationToken);
            return ApiCreated(ToDeviceDto(device), "Power device created successfully");
        }
        catch (Exception ex)
        {
            return ApiBadRequest(ex);
        }
    }

    [HttpPut("devices/{id:long}")]
    public async Task<IActionResult> UpdateDevice(long id, [FromBody] UpsertPowerDeviceRequest request, CancellationToken cancellationToken)
    {
        try
        {
            await EnsurePowerSchemaAsync(cancellationToken);
            var device = await _db.PowerDevices.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
            if (device is null)
            {
                return ApiNotFound("Power device not found.");
            }

            var deviceCode = NormalizeDeviceCode(request.DeviceCode);
            if (string.IsNullOrWhiteSpace(deviceCode))
            {
                throw new InvalidOperationException("Device Code is required.");
            }

            var duplicate = await _db.PowerDevices.AnyAsync(x => x.Id != id && x.DeviceCode == deviceCode, cancellationToken);
            if (duplicate)
            {
                throw new InvalidOperationException($"Device Code {deviceCode} already exists.");
            }

            device.DeviceCode = deviceCode;
            device.Name = Clean(request.Name, $"Power Meter {deviceCode}");
            device.Model = Clean(request.Model, "Schneider PM8000 / PM8240");
            device.Location = Clean(request.Location);
            device.GatewayId = Clean(request.GatewayId);
            device.MqttTopic = Clean(request.MqttTopic, TopicFor(deviceCode));
            device.Enabled = request.Enabled;
            device.Status = request.Enabled ? ResolveStatus(device.LastSeen, device.Status) : "offline";
            device.UpdatedAt = DateTime.Now;
            await _db.SaveChangesAsync(cancellationToken);
            return ApiOk(ToDeviceDto(device), "Power device updated successfully");
        }
        catch (Exception ex)
        {
            return ApiBadRequest(ex);
        }
    }

    [HttpDelete("devices/{id:long}")]
    public async Task<IActionResult> DeleteDevice(long id, CancellationToken cancellationToken)
    {
        try
        {
            await EnsurePowerSchemaAsync(cancellationToken);
            var device = await _db.PowerDevices.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
            if (device is null)
            {
                return ApiNotFound("Power device not found.");
            }

            _db.PowerDevices.Remove(device);
            await _db.SaveChangesAsync(cancellationToken);
            return ApiOk(new { id }, "Power device deleted successfully");
        }
        catch (Exception ex)
        {
            return ApiBadRequest(ex);
        }
    }

    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard(CancellationToken cancellationToken)
    {
        try
        {
            await EnsurePowerSchemaAsync(cancellationToken);
            await RefreshDeviceStatusesAsync(cancellationToken);
            var devices = await DeviceQuery().OrderBy(x => x.DeviceCode).ToListAsync(cancellationToken);
            var latest = devices.Select(x => x.LatestTelemetry).Where(x => x is not null).ToList();
            return ApiOk(new
            {
                summary = new
                {
                    total_devices = devices.Count,
                    online = devices.Count(x => x.Status == "online"),
                    offline = devices.Count(x => x.Status == "offline"),
                    warning = devices.Count(x => x.Status == "warning"),
                    total_active_power_kw = latest.Sum(x => x?.ActivePowerKw ?? 0),
                    total_energy_import_kwh = latest.Sum(x => x?.EnergyImportKwh ?? 0)
                },
                devices = devices.Select(ToDeviceDto)
            });
        }
        catch (Exception ex)
        {
            return ApiBadRequest(ex);
        }
    }

    [HttpGet("devices/{id:long}/history")]
    public async Task<IActionResult> History(long id, [FromQuery] DateTime? start, [FromQuery] DateTime? end, CancellationToken cancellationToken)
    {
        try
        {
            await EnsurePowerSchemaAsync(cancellationToken);
            var to = end ?? DateTime.Now;
            var from = start ?? to.AddHours(-6);
            var rows = await _db.PowerTelemetryHistory
                .AsNoTracking()
                .Where(x => x.DeviceId == id && x.Timestamp >= from && x.Timestamp <= to)
                .OrderBy(x => x.Timestamp)
                .Take(2000)
                .ToListAsync(cancellationToken);
            return ApiOk(rows.Select(ToTelemetryDto));
        }
        catch (Exception ex)
        {
            return ApiBadRequest(ex);
        }
    }

    [HttpGet("devices/{id:long}/usage-summary")]
    public async Task<IActionResult> UsageSummary(long id, CancellationToken cancellationToken)
    {
        try
        {
            await EnsurePowerSchemaAsync(cancellationToken);
            var exists = await _db.PowerDevices.AsNoTracking().AnyAsync(x => x.Id == id, cancellationToken);
            if (!exists)
            {
                return ApiNotFound("Power device not found.");
            }

            var to = DateTime.Now;
            var from = to.AddDays(-30);
            var rows = await _db.PowerTelemetryHistory
                .AsNoTracking()
                .Where(x => x.DeviceId == id && x.Timestamp >= from && x.Timestamp <= to && x.EnergyImportKwh != null)
                .OrderBy(x => x.Timestamp)
                .Select(x => new UsagePoint(x.Timestamp, x.EnergyImportKwh!.Value))
                .ToListAsync(cancellationToken);

            return ApiOk(new
            {
                calculated_at = to,
                unit = "kWh",
                hourly = CalculateUsageRate(rows, TimeSpan.FromHours(1), to),
                daily = CalculateUsageRate(rows, TimeSpan.FromDays(1), to),
                weekly = CalculateUsageRate(rows, TimeSpan.FromDays(7), to),
                monthly = CalculateUsageRate(rows, TimeSpan.FromDays(30), to)
            });
        }
        catch (Exception ex)
        {
            return ApiBadRequest(ex);
        }
    }

    private IQueryable<PowerDevice> DeviceQuery() =>
        _db.PowerDevices.AsNoTracking().Include(x => x.LatestTelemetry);

    private async Task RefreshDeviceStatusesAsync(CancellationToken cancellationToken)
    {
        var cutoff = DateTime.Now.AddSeconds(-OfflineTimeoutSeconds());
        await _db.PowerDevices
            .Where(x => !x.Enabled || x.LastSeen == null || x.LastSeen < cutoff)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(x => x.Status, "offline")
                .SetProperty(x => x.UpdatedAt, DateTime.Now), cancellationToken);
    }

    private static object ToDeviceDto(PowerDevice device) => new
    {
        id = device.Id,
        device_code = device.DeviceCode,
        name = device.Name,
        model = device.Model,
        location = device.Location,
        gateway_id = device.GatewayId,
        mqtt_topic = device.MqttTopic,
        status = device.Status,
        enabled = device.Enabled,
        last_seen = device.LastSeen,
        created_at = device.CreatedAt,
        updated_at = device.UpdatedAt,
        latest = device.LatestTelemetry is null ? null : ToTelemetryDto(device.LatestTelemetry)
    };

    private static object ToTelemetryDto(PowerLatestTelemetry telemetry) => new
    {
        timestamp = telemetry.Timestamp,
        voltage_l1n = telemetry.VoltageL1n,
        voltage_l2n = telemetry.VoltageL2n,
        voltage_l3n = telemetry.VoltageL3n,
        voltage_l1l2 = telemetry.VoltageL1l2,
        voltage_l2l3 = telemetry.VoltageL2l3,
        voltage_l3l1 = telemetry.VoltageL3l1,
        current_l1 = telemetry.CurrentL1,
        current_l2 = telemetry.CurrentL2,
        current_l3 = telemetry.CurrentL3,
        current_neutral = telemetry.CurrentNeutral,
        active_power_kw = telemetry.ActivePowerKw,
        reactive_power_kvar = telemetry.ReactivePowerKvar,
        apparent_power_kva = telemetry.ApparentPowerKva,
        power_factor = telemetry.PowerFactor,
        frequency_hz = telemetry.FrequencyHz,
        energy_import_kwh = telemetry.EnergyImportKwh,
        energy_export_kwh = telemetry.EnergyExportKwh,
        received_at = telemetry.ReceivedAt,
        updated_at = telemetry.UpdatedAt
    };

    private static object ToTelemetryDto(PowerTelemetryHistory telemetry) => new
    {
        timestamp = telemetry.Timestamp,
        voltage_l1n = telemetry.VoltageL1n,
        voltage_l2n = telemetry.VoltageL2n,
        voltage_l3n = telemetry.VoltageL3n,
        voltage_l1l2 = telemetry.VoltageL1l2,
        voltage_l2l3 = telemetry.VoltageL2l3,
        voltage_l3l1 = telemetry.VoltageL3l1,
        current_l1 = telemetry.CurrentL1,
        current_l2 = telemetry.CurrentL2,
        current_l3 = telemetry.CurrentL3,
        current_neutral = telemetry.CurrentNeutral,
        active_power_kw = telemetry.ActivePowerKw,
        reactive_power_kvar = telemetry.ReactivePowerKvar,
        apparent_power_kva = telemetry.ApparentPowerKva,
        power_factor = telemetry.PowerFactor,
        frequency_hz = telemetry.FrequencyHz,
        energy_import_kwh = telemetry.EnergyImportKwh,
        energy_export_kwh = telemetry.EnergyExportKwh,
        received_at = telemetry.ReceivedAt,
        updated_at = telemetry.UpdatedAt
    };

    private static object CalculateUsageRate(IReadOnlyCollection<UsagePoint> rows, TimeSpan targetPeriod, DateTime end)
    {
        var windowStart = end.AddDays(-30);
        var windowRows = rows
            .Where(x => x.Timestamp >= windowStart && x.Timestamp <= end)
            .OrderBy(x => x.Timestamp)
            .ToList();

        if (windowRows.Count < 2)
        {
            return new
            {
                average_kwh = (decimal?)null,
                total_kwh = (decimal?)null,
                samples = windowRows.Count,
                from = (DateTime?)null,
                to = (DateTime?)null
            };
        }

        var first = windowRows.First();
        var last = windowRows.Last();
        var elapsedHours = Math.Max((decimal)(last.Timestamp - first.Timestamp).TotalHours, 0.000001m);
        var consumed = Math.Max(0, last.EnergyImportKwh - first.EnergyImportKwh);
        var periodHours = (decimal)targetPeriod.TotalHours;
        var average = consumed / elapsedHours * periodHours;

        return new
        {
            average_kwh = Math.Round(average, 3),
            total_kwh = Math.Round(consumed, 3),
            samples = windowRows.Count,
            from = first.Timestamp,
            to = last.Timestamp
        };
    }

    private sealed record UsagePoint(DateTime Timestamp, decimal EnergyImportKwh);

    private async Task EnsurePowerSchemaAsync(CancellationToken cancellationToken)
    {
        await _db.Database.ExecuteSqlRawAsync(PowerSchemaSql, cancellationToken);
    }

    private static string NormalizeDeviceCode(string? value) => Clean(value).ToUpperInvariant();

    private static string Clean(string? value, string fallback = "") =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    private static string TopicFor(string deviceCode) => $"utility/power/{deviceCode}/telemetry";

    private static string ResolveStatus(DateTime? lastSeen, string status)
    {
        if (string.Equals(status, "warning", StringComparison.OrdinalIgnoreCase))
        {
            return "warning";
        }

        return lastSeen.HasValue && lastSeen.Value >= DateTime.Now.AddSeconds(-OfflineTimeoutSeconds())
            ? "online"
            : "offline";
    }

    private static int OfflineTimeoutSeconds()
    {
        var value = Environment.GetEnvironmentVariable("DEVICE_OFFLINE_TIMEOUT_SECONDS");
        return int.TryParse(value, out var seconds) && seconds > 0 ? seconds : DefaultOfflineTimeoutSeconds;
    }

    private const string PowerSchemaSql = """
CREATE TABLE IF NOT EXISTS power_devices (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    model VARCHAR(150) NOT NULL DEFAULT 'Schneider PM8000 / PM8240',
    location VARCHAR(150) NULL,
    gateway_id VARCHAR(80) NULL,
    mqtt_topic VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'offline',
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    last_seen DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_power_devices_device_code (device_code),
    INDEX ix_power_devices_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS power_latest_telemetry (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id BIGINT NOT NULL,
    timestamp DATETIME(6) NOT NULL,
    voltage_l1n DECIMAL(18,6) NULL,
    voltage_l2n DECIMAL(18,6) NULL,
    voltage_l3n DECIMAL(18,6) NULL,
    voltage_l1l2 DECIMAL(18,6) NULL,
    voltage_l2l3 DECIMAL(18,6) NULL,
    voltage_l3l1 DECIMAL(18,6) NULL,
    current_l1 DECIMAL(18,6) NULL,
    current_l2 DECIMAL(18,6) NULL,
    current_l3 DECIMAL(18,6) NULL,
    current_neutral DECIMAL(18,6) NULL,
    active_power_kw DECIMAL(18,6) NULL,
    reactive_power_kvar DECIMAL(18,6) NULL,
    apparent_power_kva DECIMAL(18,6) NULL,
    power_factor DECIMAL(12,6) NULL,
    frequency_hz DECIMAL(12,6) NULL,
    energy_import_kwh DECIMAL(20,6) NULL,
    energy_export_kwh DECIMAL(20,6) NULL,
    received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_power_latest_device_id (device_id),
    INDEX ix_power_latest_telemetry_timestamp (timestamp),
    CONSTRAINT fk_power_latest_device FOREIGN KEY (device_id) REFERENCES power_devices(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS power_telemetry_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id BIGINT NOT NULL,
    timestamp DATETIME(6) NOT NULL,
    voltage_l1n DECIMAL(18,6) NULL,
    voltage_l2n DECIMAL(18,6) NULL,
    voltage_l3n DECIMAL(18,6) NULL,
    voltage_l1l2 DECIMAL(18,6) NULL,
    voltage_l2l3 DECIMAL(18,6) NULL,
    voltage_l3l1 DECIMAL(18,6) NULL,
    current_l1 DECIMAL(18,6) NULL,
    current_l2 DECIMAL(18,6) NULL,
    current_l3 DECIMAL(18,6) NULL,
    current_neutral DECIMAL(18,6) NULL,
    active_power_kw DECIMAL(18,6) NULL,
    reactive_power_kvar DECIMAL(18,6) NULL,
    apparent_power_kva DECIMAL(18,6) NULL,
    power_factor DECIMAL(12,6) NULL,
    frequency_hz DECIMAL(12,6) NULL,
    energy_import_kwh DECIMAL(20,6) NULL,
    energy_export_kwh DECIMAL(20,6) NULL,
    received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX ix_power_telemetry_history_device_id (device_id),
    INDEX ix_power_telemetry_history_timestamp (timestamp),
    INDEX ix_power_telemetry_history_device_timestamp (device_id, timestamp),
    CONSTRAINT fk_power_history_device FOREIGN KEY (device_id) REFERENCES power_devices(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO power_devices (device_code, name, model, location, gateway_id, mqtt_topic, status, enabled)
SELECT seed.device_code, seed.name, seed.model, seed.location, seed.gateway_id, seed.mqtt_topic, seed.status, seed.enabled
FROM (
    SELECT 'PM-01' device_code, 'Main Panel 01' name, 'Schneider PM8000 / PM8240' model, 'Electrical Room' location, 'GW-01' gateway_id, 'utility/power/PM-01/telemetry' mqtt_topic, 'offline' status, 1 enabled
    UNION ALL SELECT 'PM-02', 'Main Panel 02', 'Schneider PM8000 / PM8240', 'Electrical Room', 'GW-01', 'utility/power/PM-02/telemetry', 'offline', 1
    UNION ALL SELECT 'PM-03', 'Main Panel 03', 'Schneider PM8000 / PM8240', 'Electrical Room', 'GW-01', 'utility/power/PM-03/telemetry', 'offline', 1
    UNION ALL SELECT 'PM-04', 'Main Panel 04', 'Schneider PM8000 / PM8240', 'Electrical Room', 'GW-01', 'utility/power/PM-04/telemetry', 'offline', 1
    UNION ALL SELECT 'PM-05', 'Main Panel 05', 'Schneider PM8000 / PM8240', 'Electrical Room', 'GW-01', 'utility/power/PM-05/telemetry', 'offline', 1
) seed
WHERE NOT EXISTS (SELECT 1 FROM power_devices);
""";
}
