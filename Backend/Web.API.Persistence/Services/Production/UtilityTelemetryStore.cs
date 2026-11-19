using Microsoft.EntityFrameworkCore;
using Web.API.Domain.Production;
using Web.API.Persistence.Context;

namespace Web.API.Persistence.Services.Production;

public static class UtilityTelemetryStore
{
    public static bool ValidKind(string kind) => kind is "water" or "compressed-air";
    public static string Topic(string kind, string code) => $"utility/{kind}/{code}/telemetry";

    public static Task EnsureSchemaAsync(AppDbContext db, CancellationToken ct) => db.Database.ExecuteSqlRawAsync("""
CREATE TABLE IF NOT EXISTS utility_types (
 Code VARCHAR(20) NOT NULL PRIMARY KEY, Name VARCHAR(80) NOT NULL,
 UNIQUE KEY uq_utility_types_name (Name)
) ENGINE=InnoDB;
INSERT IGNORE INTO utility_types (Code, Name) VALUES ('water', 'Water'), ('compressed-air', 'Compressed Air');
CREATE TABLE IF NOT EXISTS utility_devices (
 Id BIGINT AUTO_INCREMENT PRIMARY KEY, Kind VARCHAR(20) NOT NULL,
 DeviceCode VARCHAR(50) NOT NULL, Name VARCHAR(150) NOT NULL, Location VARCHAR(150) NOT NULL DEFAULT '',
 Enabled TINYINT(1) NOT NULL DEFAULT 1, LowPressureBar DECIMAL(20,6) NULL, HighFlowRate DECIMAL(20,6) NULL,
 UNIQUE KEY uq_utility_kind_code (Kind, DeviceCode),
 CONSTRAINT fk_utility_devices_type FOREIGN KEY (Kind) REFERENCES utility_types(Code) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS utility_readings (
 Id BIGINT AUTO_INCREMENT PRIMARY KEY, DeviceId BIGINT NOT NULL,
 Timestamp DATETIME(6) NOT NULL, ReceivedAt DATETIME(6) NOT NULL,
 FlowRate DECIMAL(20,6) NOT NULL, TotalVolume DECIMAL(20,6) NOT NULL,
 PressureBar DECIMAL(20,6) NULL, TemperatureC DECIMAL(20,6) NULL, PowerKw DECIMAL(20,6) NULL,
 UNIQUE KEY uq_utility_device_timestamp (DeviceId, Timestamp),
 FOREIGN KEY (DeviceId) REFERENCES utility_devices(Id) ON DELETE CASCADE
) ENGINE=InnoDB;
""", ct);

    // All timestamps in these tables are UTC; the UI renders them in the viewer's timezone.
    public static async Task<bool> RecordAsync(AppDbContext db, UtilityDevice device, UtilityReadingRequest request, CancellationToken ct)
    {
        if (!device.Enabled) throw new InvalidOperationException("Device is disabled.");
        if (request.Timestamp == default || request.Timestamp > DateTimeOffset.UtcNow.AddMinutes(5))
            throw new InvalidOperationException("A valid timestamp with timezone is required; future readings are rejected.");
        if (request.FlowRate < 0 || request.TotalVolume < 0 || request.PressureBar < 0 || request.PowerKw < 0 ||
            request.FlowRate > 1000000000 || request.TotalVolume > 1000000000000 || request.PressureBar > 1000000 ||
            request.PowerKw > 1000000000 || request.TemperatureC is < -273.15m or > 10000)
            throw new InvalidOperationException("Measurements are outside the supported range.");
        if (device.Kind == "water" && request.PowerKw != null)
            throw new InvalidOperationException("Power is only supported for compressed air.");
        var timestamp = request.Timestamp.UtcDateTime;
        if (await db.UtilityReadings.AnyAsync(x => x.DeviceId == device.Id && x.Timestamp == timestamp, ct)) return false;
        db.UtilityReadings.Add(new UtilityReading {
            DeviceId = device.Id, Timestamp = timestamp, ReceivedAt = DateTime.UtcNow,
            FlowRate = request.FlowRate, TotalVolume = request.TotalVolume, PressureBar = request.PressureBar,
            TemperatureC = request.TemperatureC, PowerKw = request.PowerKw
        });
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (ex.InnerException is MySqlConnector.MySqlException { Number: 1062 })
        {
            db.ChangeTracker.Clear();
            return false; // MQTT QoS redelivery, including concurrent deliveries.
        }
        return true;
    }

    public static object ReadingDto(UtilityReading r) => new {
        r.Id, timestamp = DateTime.SpecifyKind(r.Timestamp, DateTimeKind.Utc), r.FlowRate,
        r.TotalVolume, r.PressureBar, r.TemperatureC, r.PowerKw
    };
    public static object DeviceDto(UtilityDevice d, UtilityReading? latest)
    {
        var online = d.Enabled && latest != null && latest.Timestamp >= DateTime.UtcNow.AddSeconds(-120);
        var warnings = new List<string>();
        if (online && d.LowPressureBar != null && latest!.PressureBar < d.LowPressureBar) warnings.Add("Low pressure");
        if (online && d.HighFlowRate != null && latest!.FlowRate > d.HighFlowRate) warnings.Add("High flow");
        return new { d.Id, d.Kind, d.DeviceCode, d.Name, d.Location, d.Enabled, d.LowPressureBar, d.HighFlowRate,
            mqttTopic = Topic(d.Kind, d.DeviceCode), status = !online ? "offline" : warnings.Count > 0 ? "warning" : "online",
            warnings, latest = latest == null ? null : ReadingDto(latest) };
    }
}
