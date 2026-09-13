using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net.Sockets;
using Web.API.Domain.Production;
using Web.API.Persistence.Context;
using Web.API.Persistence.Services.Production;

namespace Web.API.Controllers;

[ApiController]
[Route("api/shms-system")]
public class SHMSSystemController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly IMqttConfigurationService _mqttConfigurationService;

    public SHMSSystemController(
        AppDbContext db,
        IMqttConfigurationService mqttConfigurationService)
    {
        _db = db;
        _mqttConfigurationService = mqttConfigurationService;
    }

    [HttpGet("settings")]
    public async Task<IActionResult> Settings(CancellationToken cancellationToken)
    {
        try
        {
            await EnsureSystemSettingsAsync(cancellationToken);
            return ApiOk(await ReadSystemSettingsAsync(cancellationToken));
        }
        catch (Exception ex)
        {
            return ApiBadRequest(ex);
        }
    }

    [HttpPut("settings")]
    public async Task<IActionResult> UpdateSettings(
        [FromBody] UpdateSystemSettingsRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            await EnsureSystemSettingsAsync(cancellationToken);
            var pressureUnit = await EnsureMeasurementUnitAsync("pressure", request.PressureUnit, request.PressureUnit, cancellationToken);
            var cycleTimeUnit = await EnsureMeasurementUnitAsync("cycle_time", request.CycleTimeUnit, request.CycleTimeUnit, cancellationToken);

            var settings = await _db.SystemSettings.FirstOrDefaultAsync(x => x.Id == 1, cancellationToken);
            if (settings is null)
            {
                settings = new SystemSetting { Id = 1, CreatedAt = DateTime.Now };
                _db.SystemSettings.Add(settings);
            }

            settings.PressureUnitId = pressureUnit.Id;
            settings.CycleTimeUnitId = cycleTimeUnit.Id;
            settings.BackupDbLocation = request.BackupDbLocation;
            settings.BackupSchedule = string.IsNullOrWhiteSpace(request.BackupSchedule) ? "daily" : request.BackupSchedule.Trim();
            settings.PlcIpAddress = request.PlcIpAddress;
            settings.ElectricityRatePerKwh = Math.Max(0, request.ElectricityRatePerKwh);
            settings.UpdatedAt = DateTime.Now;

            await _db.SaveChangesAsync(cancellationToken);
            return ApiOk(await ReadSystemSettingsAsync(cancellationToken), "Settings updated successfully");
        }
        catch (Exception ex)
        {
            return ApiBadRequest(ex);
        }
    }

    [HttpGet("mqtt-configuration")]
    public async Task<IActionResult> MqttConfiguration(CancellationToken cancellationToken)
    {
        try
        {
            return ApiOk(await _mqttConfigurationService.GetAsync(cancellationToken));
        }
        catch (Exception ex)
        {
            return ApiBadRequest(ex);
        }
    }

    [HttpPut("mqtt-configuration")]
    public async Task<IActionResult> UpdateMqttConfiguration(
        [FromBody] UpdateMqttConfigurationRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            return ApiOk(await _mqttConfigurationService.UpdateAsync(request, cancellationToken), "MQTT configuration updated successfully");
        }
        catch (Exception ex)
        {
            return ApiBadRequest(ex);
        }
    }

    [HttpGet("status")]
    public async Task<IActionResult> Status(CancellationToken cancellationToken)
    {
        try
        {
            var lastMqttAt = await _db.LogBuffers
                .AsNoTracking()
                .OrderByDescending(x => x.TimeStamp)
                .Select(x => (DateTime?)x.TimeStamp)
                .FirstOrDefaultAsync(cancellationToken);
            await EnsureServerSyncStatusAsync(cancellationToken);
            var syncStatus = await _db.ServerSyncStatuses
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == 1, cancellationToken);
            var downtimeSeconds = syncStatus is { IsOnline: false, OutageStartedAt: not null }
                ? Math.Max(0, (int)(DateTime.Now - syncStatus.OutageStartedAt.Value).TotalSeconds)
                : 0;

            return ApiOk(new
            {
                status = "online",
                checked_at = DateTime.Now,
                last_mqtt_at = lastMqttAt,
                main_server = syncStatus is null
                    ? new
                    {
                        configured = false,
                        server_name = "Witon Server",
                        endpoint_url = (string?)null,
                        online = false,
                        outage_started_at = (DateTime?)null,
                        downtime_seconds = 0,
                        last_success_at = (DateTime?)null,
                        last_failure_at = (DateTime?)null,
                        last_error = (string?)null,
                        redis_buffer_count = 0L,
                        db_spillover_count = 0L
                    }
                    : new
                    {
                        configured = !string.IsNullOrWhiteSpace(syncStatus.EndpointUrl),
                        server_name = syncStatus.ServerName,
                        endpoint_url = syncStatus.EndpointUrl,
                        online = syncStatus.IsOnline,
                        outage_started_at = syncStatus.OutageStartedAt,
                        downtime_seconds = downtimeSeconds,
                        last_success_at = syncStatus.LastSuccessAt,
                        last_failure_at = syncStatus.LastFailureAt,
                        last_error = syncStatus.LastError,
                        redis_buffer_count = syncStatus.RedisBufferCount,
                        db_spillover_count = syncStatus.DbSpilloverCount
                    }
            });
        }
        catch (Exception ex)
        {
            return ApiBadRequest(ex);
        }
    }

    [HttpGet("mqtt-broker/status")]
    public async Task<IActionResult> MqttBrokerStatus(CancellationToken cancellationToken)
    {
        try
        {
            var settings = LoadMqttBrokerStatusSettings();
            var isOnline = await CheckTcpReachableAsync(settings.Host, settings.Port, cancellationToken);

            return ApiOk(new
            {
                host = settings.Host,
                port = settings.Port,
                configured = true,
                online = isOnline,
                checked_at = DateTime.Now
            });
        }
        catch (Exception ex)
        {
            return ApiBadRequest(ex);
        }
    }

    private async Task<SystemSettingsResponse> ReadSystemSettingsAsync(CancellationToken cancellationToken)
    {
        var settings = await _db.SystemSettings
            .AsNoTracking()
            .Include(x => x.PressureUnit)
            .Include(x => x.CycleTimeUnit)
            .FirstOrDefaultAsync(x => x.Id == 1, cancellationToken);

        return new SystemSettingsResponse
        {
            PressureUnit = settings?.PressureUnit?.UnitSymbol ?? "MPa",
            CycleTimeUnit = settings?.CycleTimeUnit?.UnitSymbol ?? "s",
            BackupDbLocation = settings?.BackupDbLocation ?? string.Empty,
            BackupSchedule = settings?.BackupSchedule ?? "daily",
            PlcIpAddress = settings?.PlcIpAddress ?? string.Empty,
            ElectricityRatePerKwh = settings?.ElectricityRatePerKwh ?? 0
        };
    }

    private async Task EnsureServerSyncStatusAsync(CancellationToken cancellationToken)
    {
        await _db.Database.ExecuteSqlRawAsync(@"
CREATE TABLE IF NOT EXISTS server_sync_status (
    id INT PRIMARY KEY,
    server_name VARCHAR(100) NOT NULL,
    endpoint_url VARCHAR(500) NULL,
    is_online TINYINT(1) NOT NULL DEFAULT 0,
    outage_started_at DATETIME(6) NULL,
    last_success_at DATETIME(6) NULL,
    last_failure_at DATETIME(6) NULL,
    last_error TEXT NULL,
    redis_buffer_count BIGINT NOT NULL DEFAULT 0,
    db_spillover_count BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;", cancellationToken);
    }

    private async Task EnsureSystemSettingsAsync(CancellationToken cancellationToken)
    {
        await _db.Database.ExecuteSqlRawAsync(@"
CREATE TABLE IF NOT EXISTS measurement_units (
    id INT AUTO_INCREMENT PRIMARY KEY,
    unit_category VARCHAR(50) NOT NULL,
    unit_symbol VARCHAR(20) NOT NULL,
    unit_name VARCHAR(80) NOT NULL,
    is_deleted TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_measurement_units_category_symbol (unit_category, unit_symbol)
);

CREATE TABLE IF NOT EXISTS system_settings (
    id INT PRIMARY KEY,
    pressure_unit_id INT NOT NULL,
    cycle_time_unit_id INT NOT NULL,
    backup_db_location VARCHAR(500) NULL,
    backup_schedule VARCHAR(20) NOT NULL DEFAULT 'daily',
    plc_ip_address VARCHAR(80) NULL,
    electricity_rate_per_kwh DECIMAL(18,2) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_system_settings_pressure_unit
        FOREIGN KEY (pressure_unit_id) REFERENCES measurement_units (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_system_settings_cycle_time_unit
        FOREIGN KEY (cycle_time_unit_id) REFERENCES measurement_units (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);", cancellationToken);

        await EnsureMeasurementUnitAsync("pressure", "MPa", "Megapascal", cancellationToken);
        await EnsureMeasurementUnitAsync("cycle_time", "s", "Second", cancellationToken);

        await _db.Database.ExecuteSqlRawAsync(@"
INSERT INTO system_settings
    (id, pressure_unit_id, cycle_time_unit_id, backup_schedule)
SELECT
    1,
    pressure.id,
    cycle_time.id,
    'daily'
FROM measurement_units pressure
CROSS JOIN measurement_units cycle_time
WHERE pressure.unit_category = 'pressure'
  AND pressure.unit_symbol = 'MPa'
  AND cycle_time.unit_category = 'cycle_time'
  AND cycle_time.unit_symbol = 's'
ON DUPLICATE KEY UPDATE
    id = system_settings.id;", cancellationToken);

        await _db.Database.ExecuteSqlRawAsync(@"
SET @electricity_rate_column_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'system_settings'
      AND COLUMN_NAME = 'electricity_rate_per_kwh'
);
SET @add_electricity_rate_sql := IF(
    @electricity_rate_column_exists = 0,
    'ALTER TABLE system_settings ADD COLUMN electricity_rate_per_kwh DECIMAL(18,2) NOT NULL DEFAULT 0 AFTER plc_ip_address',
    'SELECT 1'
);
PREPARE add_electricity_rate_statement FROM @add_electricity_rate_sql;
EXECUTE add_electricity_rate_statement;
DEALLOCATE PREPARE add_electricity_rate_statement;", cancellationToken);
    }

    private async Task<MeasurementUnit> EnsureMeasurementUnitAsync(
        string category,
        string symbol,
        string name,
        CancellationToken cancellationToken)
    {
        var normalizedSymbol = string.IsNullOrWhiteSpace(symbol) ? "unit" : symbol.Trim();
        var unit = await _db.MeasurementUnits.FirstOrDefaultAsync(
            x => x.UnitCategory == category && x.UnitSymbol == normalizedSymbol,
            cancellationToken);

        if (unit is not null)
        {
            unit.UnitName = string.IsNullOrWhiteSpace(name) ? normalizedSymbol : name.Trim();
            unit.IsDeleted = false;
            unit.UpdatedAt = DateTime.Now;
            await _db.SaveChangesAsync(cancellationToken);
            return unit;
        }

        unit = new MeasurementUnit
        {
            UnitCategory = category,
            UnitSymbol = normalizedSymbol,
            UnitName = string.IsNullOrWhiteSpace(name) ? normalizedSymbol : name.Trim(),
            IsDeleted = false,
            CreatedAt = DateTime.Now,
            UpdatedAt = DateTime.Now
        };
        _db.MeasurementUnits.Add(unit);
        await _db.SaveChangesAsync(cancellationToken);
        return unit;
    }

    private static async Task<bool> CheckTcpReachableAsync(string host, int port, CancellationToken cancellationToken)
    {
        using var client = new TcpClient();
        try
        {
            var connectTask = client.ConnectAsync(host, port, cancellationToken).AsTask();
            var timeoutTask = Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
            var completed = await Task.WhenAny(connectTask, timeoutTask);
            return completed == connectTask && client.Connected;
        }
        catch
        {
            return false;
        }
    }

    private static MqttBrokerStatusSettings LoadMqttBrokerStatusSettings()
    {
        var host = Environment.GetEnvironmentVariable("MQTT_HOST");
        if (string.IsNullOrWhiteSpace(host))
        {
            host = "emqx.broker.io";
        }

        var portValue = Environment.GetEnvironmentVariable("MQTT_PORT");
        var port = int.TryParse(portValue, out var parsedPort) ? parsedPort : 1883;
        return new MqttBrokerStatusSettings(host, port);
    }

    private sealed record MqttBrokerStatusSettings(string Host, int Port);
}
