using System.Text.Json;
using System.Text.Json.Serialization;
using Dapper;
using Microsoft.Extensions.Logging;
using MySql.Data.MySqlClient;
using Worker.Configuration;
using Worker.Shared;

namespace Worker.Infrastructure.Persistence;

public sealed class PowerTelemetryWriterService : IPowerTelemetryWriterService
{
    private readonly ILogger<PowerTelemetryWriterService> _logger;

    public PowerTelemetryWriterService(ILogger<PowerTelemetryWriterService> logger)
    {
        _logger = logger;
    }

    public async Task WaitUntilReadyAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = new MySqlConnection(DatabaseConfig.MysqlConnString);
        await DbRetry.OpenWithRetryAsync(connection, _logger, "PowerTelemetry", cancellationToken);
        await EnsureTablesAsync(connection, cancellationToken);
    }

    public async Task<bool> UpsertAsync(string topic, string payload, CancellationToken cancellationToken = default)
    {
        if (!topic.StartsWith("utility/power/", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        PowerPayload message;
        try
        {
            message = JsonSerializer.Deserialize<PowerPayload>(payload, JsonOptions)
                ?? throw new FormatException("MQTT payload is empty.");
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "[Power] Malformed MQTT JSON rejected. Topic={Topic}", topic);
            return true;
        }

        var validationError = Validate(message);
        if (validationError is not null)
        {
            _logger.LogWarning("[Power] MQTT payload rejected. Topic={Topic} Reason={Reason}", topic, validationError);
            return true;
        }

        await using var connection = new MySqlConnection(DatabaseConfig.MysqlConnString);
        await DbRetry.OpenWithRetryAsync(connection, _logger, "PowerTelemetry", cancellationToken);
        await EnsureTablesAsync(connection, cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        var device = await connection.QuerySingleOrDefaultAsync<DeviceRow>(
            new CommandDefinition(
                "SELECT id, enabled FROM power_devices WHERE device_code = @deviceCode LIMIT 1;",
                new { deviceCode = message.DeviceCode.Trim().ToUpperInvariant() },
                transaction,
                cancellationToken: cancellationToken));

        if (device is null)
        {
            await transaction.RollbackAsync(cancellationToken);
            _logger.LogWarning("[Power] Unknown deviceCode rejected. DeviceCode={DeviceCode} Topic={Topic}", message.DeviceCode, topic);
            return true;
        }

        if (!device.Enabled)
        {
            await transaction.RollbackAsync(cancellationToken);
            _logger.LogWarning("[Power] Disabled device telemetry ignored. DeviceCode={DeviceCode}", message.DeviceCode);
            return true;
        }

        var row = ToRow(device.Id, message);
        await connection.ExecuteAsync(new CommandDefinition(UpdateDeviceSql, row, transaction, cancellationToken: cancellationToken));
        await connection.ExecuteAsync(new CommandDefinition(UpsertLatestSql, row, transaction, cancellationToken: cancellationToken));
        await connection.ExecuteAsync(new CommandDefinition(InsertHistorySql, row, transaction, cancellationToken: cancellationToken));
        await transaction.CommitAsync(cancellationToken);
        _logger.LogInformation("[Power] Telemetry stored. Device={DeviceCode} Topic={Topic}", message.DeviceCode, topic);
        return true;
    }

    private static string? Validate(PowerPayload message)
    {
        if (string.IsNullOrWhiteSpace(message.DeviceCode)) return "deviceCode is required";
        if (message.Timestamp == default) return "timestamp is required or invalid";
        if (message.Measurements is null) return "measurements is required";
        if (message.Measurements.Voltage is null) return "measurements.voltage is required";
        if (message.Measurements.Current is null) return "measurements.current is required";
        if (message.Measurements.Power is null) return "measurements.power is required";
        if (message.Measurements.Energy is null) return "measurements.energy is required";
        return null;
    }

    private static object ToRow(long deviceId, PowerPayload message)
    {
        var measurements = message.Measurements!;
        var status = string.Equals(message.Status, "warning", StringComparison.OrdinalIgnoreCase) ? "warning" : "online";
        return new
        {
            device_id = deviceId,
            status,
            timestamp = message.Timestamp.UtcDateTime,
            voltage_l1n = measurements.Voltage?.L1n,
            voltage_l2n = measurements.Voltage?.L2n,
            voltage_l3n = measurements.Voltage?.L3n,
            voltage_l1l2 = measurements.Voltage?.L1l2,
            voltage_l2l3 = measurements.Voltage?.L2l3,
            voltage_l3l1 = measurements.Voltage?.L3l1,
            current_l1 = measurements.Current?.L1,
            current_l2 = measurements.Current?.L2,
            current_l3 = measurements.Current?.L3,
            current_neutral = measurements.Current?.Neutral,
            active_power_kw = measurements.Power?.ActiveKw,
            reactive_power_kvar = measurements.Power?.ReactiveKvar,
            apparent_power_kva = measurements.Power?.ApparentKva,
            power_factor = measurements.Power?.PowerFactor,
            frequency_hz = measurements.FrequencyHz,
            energy_import_kwh = measurements.Energy?.ImportKwh,
            energy_export_kwh = measurements.Energy?.ExportKwh
        };
    }

    private static async Task EnsureTablesAsync(MySqlConnection connection, CancellationToken cancellationToken)
    {
        await connection.ExecuteAsync(new CommandDefinition(PowerSchemaSql, cancellationToken: cancellationToken));
    }

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private sealed record DeviceRow(long Id, bool Enabled);

    private sealed class PowerPayload
    {
        public string DeviceCode { get; set; } = string.Empty;
        public DateTimeOffset Timestamp { get; set; }
        public string Status { get; set; } = "online";
        public PowerMeasurements? Measurements { get; set; }
    }

    private sealed class PowerMeasurements
    {
        public VoltageMeasurements? Voltage { get; set; }
        public CurrentMeasurements? Current { get; set; }
        public PowerMeasurementsBlock? Power { get; set; }
        [JsonPropertyName("frequency_hz")]
        public decimal? FrequencyHz { get; set; }
        public EnergyMeasurements? Energy { get; set; }
    }

    private sealed class VoltageMeasurements
    {
        public decimal? L1n { get; set; }
        public decimal? L2n { get; set; }
        public decimal? L3n { get; set; }
        public decimal? L1l2 { get; set; }
        public decimal? L2l3 { get; set; }
        public decimal? L3l1 { get; set; }
    }

    private sealed class CurrentMeasurements
    {
        public decimal? L1 { get; set; }
        public decimal? L2 { get; set; }
        public decimal? L3 { get; set; }
        public decimal? Neutral { get; set; }
    }

    private sealed class PowerMeasurementsBlock
    {
        [JsonPropertyName("active_kw")]
        public decimal? ActiveKw { get; set; }
        [JsonPropertyName("reactive_kvar")]
        public decimal? ReactiveKvar { get; set; }
        [JsonPropertyName("apparent_kva")]
        public decimal? ApparentKva { get; set; }
        [JsonPropertyName("power_factor")]
        public decimal? PowerFactor { get; set; }
    }

    private sealed class EnergyMeasurements
    {
        [JsonPropertyName("import_kwh")]
        public decimal? ImportKwh { get; set; }
        [JsonPropertyName("export_kwh")]
        public decimal? ExportKwh { get; set; }
    }

    private const string UpdateDeviceSql = """
        UPDATE power_devices
        SET status = @status,
            last_seen = CURRENT_TIMESTAMP(6),
            updated_at = CURRENT_TIMESTAMP(6)
        WHERE id = @device_id;
        """;

    private const string UpsertLatestSql = """
        INSERT INTO power_latest_telemetry
            (device_id, timestamp, voltage_l1n, voltage_l2n, voltage_l3n, voltage_l1l2, voltage_l2l3, voltage_l3l1,
             current_l1, current_l2, current_l3, current_neutral, active_power_kw, reactive_power_kvar, apparent_power_kva,
             power_factor, frequency_hz, energy_import_kwh, energy_export_kwh, received_at, updated_at)
        VALUES
            (@device_id, @timestamp, @voltage_l1n, @voltage_l2n, @voltage_l3n, @voltage_l1l2, @voltage_l2l3, @voltage_l3l1,
             @current_l1, @current_l2, @current_l3, @current_neutral, @active_power_kw, @reactive_power_kvar, @apparent_power_kva,
             @power_factor, @frequency_hz, @energy_import_kwh, @energy_export_kwh, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
        ON DUPLICATE KEY UPDATE
            timestamp = VALUES(timestamp),
            voltage_l1n = VALUES(voltage_l1n),
            voltage_l2n = VALUES(voltage_l2n),
            voltage_l3n = VALUES(voltage_l3n),
            voltage_l1l2 = VALUES(voltage_l1l2),
            voltage_l2l3 = VALUES(voltage_l2l3),
            voltage_l3l1 = VALUES(voltage_l3l1),
            current_l1 = VALUES(current_l1),
            current_l2 = VALUES(current_l2),
            current_l3 = VALUES(current_l3),
            current_neutral = VALUES(current_neutral),
            active_power_kw = VALUES(active_power_kw),
            reactive_power_kvar = VALUES(reactive_power_kvar),
            apparent_power_kva = VALUES(apparent_power_kva),
            power_factor = VALUES(power_factor),
            frequency_hz = VALUES(frequency_hz),
            energy_import_kwh = VALUES(energy_import_kwh),
            energy_export_kwh = VALUES(energy_export_kwh),
            received_at = VALUES(received_at),
            updated_at = CURRENT_TIMESTAMP(6);
        """;

    private const string InsertHistorySql = """
        INSERT INTO power_telemetry_history
            (device_id, timestamp, voltage_l1n, voltage_l2n, voltage_l3n, voltage_l1l2, voltage_l2l3, voltage_l3l1,
             current_l1, current_l2, current_l3, current_neutral, active_power_kw, reactive_power_kvar, apparent_power_kva,
             power_factor, frequency_hz, energy_import_kwh, energy_export_kwh, received_at, updated_at)
        VALUES
            (@device_id, @timestamp, @voltage_l1n, @voltage_l2n, @voltage_l3n, @voltage_l1l2, @voltage_l2l3, @voltage_l3l1,
             @current_l1, @current_l2, @current_l3, @current_neutral, @active_power_kw, @reactive_power_kvar, @apparent_power_kva,
             @power_factor, @frequency_hz, @energy_import_kwh, @energy_export_kwh, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6));
        """;

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
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
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
