using Dapper;
using Microsoft.Extensions.Logging;
using MySql.Data.MySqlClient;
using Worker.Domain.Models;
using Worker.Shared;
using Worker.Configuration;
using Web.API.Persistence.Licensing;

namespace Worker.Infrastructure.Persistence;

public sealed class SensorReadingWriterService : ISensorReadingWriterService
{
    private readonly ILogger<SensorReadingWriterService> _logger;

    public SensorReadingWriterService(ILogger<SensorReadingWriterService> logger)
    {
        _logger = logger;
    }

    public async Task WaitUntilReadyAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = new MySqlConnection(DatabaseConfig.MysqlConnString);
        await DbRetry.OpenWithRetryAsync(connection, _logger, "SensorReadings", cancellationToken);
        await EnsureTablesAsync(connection, cancellationToken);
    }

    public async Task<long> InsertAsync(UtilitySensorReading reading, CancellationToken cancellationToken = default)
    {
        await using var connection = new MySqlConnection(DatabaseConfig.MysqlConnString);
        await DbRetry.OpenWithRetryAsync(connection, _logger, "SensorReadings", cancellationToken);
        await EnsureTablesAsync(connection, cancellationToken);

        await using var license = await DeviceLicense.AcquireAsync(DatabaseConfig.MysqlConnString, cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            var exists = await connection.ExecuteScalarAsync<int>(new CommandDefinition(
                "SELECT COUNT(*) FROM sensor_devices WHERE device_code = @deviceCode",
                new { deviceCode = Clamp(reading.DeviceCode, 80) }, transaction, cancellationToken: cancellationToken));
            if (exists == 0) await license.EnsureCanAddAsync(cancellationToken);
            var unitId = await ResolveUnitIdAsync(connection, transaction, reading, cancellationToken);
            var sensorTypeId = await ResolveSensorTypeIdAsync(connection, transaction, reading, unitId, cancellationToken);
            var deviceId = await ResolveSensorDeviceIdAsync(connection, transaction, reading, sensorTypeId, cancellationToken);
            var channelId = await ResolveSensorChannelIdAsync(connection, transaction, reading, deviceId, unitId, cancellationToken);

            var parameters = new
            {
                sensor_channel_id = channelId,
                measured_at = reading.MeasuredAt,
                numeric_value = reading.NumericValue,
                quality_code = reading.QualityCode,
                raw_payload = reading.RawPayload
            };

            const string insertSql = """
                INSERT INTO sensor_readings
                    (sensor_channel_id, measured_at, numeric_value, quality_code, raw_payload, ingested_at)
                VALUES
                    (@sensor_channel_id, @measured_at, @numeric_value, @quality_code, @raw_payload, CURRENT_TIMESTAMP(6))
                ON DUPLICATE KEY UPDATE
                    numeric_value = VALUES(numeric_value),
                    quality_code = VALUES(quality_code),
                    raw_payload = VALUES(raw_payload),
                    ingested_at = CURRENT_TIMESTAMP(6),
                    id = LAST_INSERT_ID(id);
                SELECT LAST_INSERT_ID();
                """;

            var id = await connection.ExecuteScalarAsync<long>(
                new CommandDefinition(insertSql, parameters, transaction, cancellationToken: cancellationToken));

            await transaction.CommitAsync(cancellationToken);
            return id;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<int> ResolveUnitIdAsync(
        MySqlConnection connection,
        MySqlTransaction transaction,
        UtilitySensorReading reading,
        CancellationToken cancellationToken)
    {
        const string sql = """
            INSERT INTO measurement_units
                (unit_category, unit_symbol, unit_name, is_deleted)
            VALUES
                (@unit_category, @unit_symbol, @unit_name, 0)
            ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), is_deleted = 0;
            SELECT LAST_INSERT_ID();
            """;

        return await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(sql, new
            {
                unit_category = Clamp(reading.UnitCategory, 50),
                unit_symbol = Clamp(reading.UnitSymbol, 20),
                unit_name = Clamp(reading.UnitSymbol, 80)
            }, transaction, cancellationToken: cancellationToken));
    }

    private static async Task<int> ResolveSensorTypeIdAsync(
        MySqlConnection connection,
        MySqlTransaction transaction,
        UtilitySensorReading reading,
        int unitId,
        CancellationToken cancellationToken)
    {
        const string sql = """
            INSERT INTO sensor_types
                (sensor_code, sensor_name, description, default_unit_id, is_active)
            VALUES
                (@sensor_code, @sensor_name, @description, @default_unit_id, 1)
            ON DUPLICATE KEY UPDATE
                id = LAST_INSERT_ID(id),
                sensor_name = VALUES(sensor_name),
                default_unit_id = VALUES(default_unit_id),
                is_active = 1;
            SELECT LAST_INSERT_ID();
            """;

        return await connection.ExecuteScalarAsync<int>(
            new CommandDefinition(sql, new
            {
                sensor_code = Clamp(reading.SensorCode, 20),
                sensor_name = Clamp($"{reading.SensorCode} Sensor", 100),
                description = Clamp($"{reading.MeasurementName} sensor", 255),
                default_unit_id = unitId
            }, transaction, cancellationToken: cancellationToken));
    }

    private static async Task<long> ResolveSensorDeviceIdAsync(
        MySqlConnection connection,
        MySqlTransaction transaction,
        UtilitySensorReading reading,
        int sensorTypeId,
        CancellationToken cancellationToken)
    {
        const string sql = """
            INSERT INTO sensor_devices
                (site_id, asset_id, zone_id, sensor_type_id, device_code, device_name, status)
            VALUES
                (1, 1, NULL, @sensor_type_id, @device_code, @device_name, 'active')
            ON DUPLICATE KEY UPDATE
                id = LAST_INSERT_ID(id),
                sensor_type_id = VALUES(sensor_type_id),
                device_name = VALUES(device_name),
                status = 'active';
            SELECT LAST_INSERT_ID();
            """;

        return await connection.ExecuteScalarAsync<long>(
            new CommandDefinition(sql, new
            {
                sensor_type_id = sensorTypeId,
                device_code = Clamp(reading.DeviceCode, 80),
                device_name = Clamp(reading.DeviceCode, 150)
            }, transaction, cancellationToken: cancellationToken));
    }

    private static async Task<long> ResolveSensorChannelIdAsync(
        MySqlConnection connection,
        MySqlTransaction transaction,
        UtilitySensorReading reading,
        long deviceId,
        int unitId,
        CancellationToken cancellationToken)
    {
        const string sql = """
            INSERT INTO sensor_channels
                (sensor_device_id, unit_id, channel_code, channel_name, measurement_name, axis, is_active)
            VALUES
                (@sensor_device_id, @unit_id, @channel_code, @channel_name, @measurement_name, @axis, 1)
            ON DUPLICATE KEY UPDATE
                id = LAST_INSERT_ID(id),
                unit_id = VALUES(unit_id),
                channel_name = VALUES(channel_name),
                measurement_name = VALUES(measurement_name),
                axis = VALUES(axis),
                is_active = 1;
            SELECT LAST_INSERT_ID();
            """;

        return await connection.ExecuteScalarAsync<long>(
            new CommandDefinition(sql, new
            {
                sensor_device_id = deviceId,
                unit_id = unitId,
                channel_code = Clamp(reading.ChannelCode, 80),
                channel_name = Clamp(reading.ChannelCode, 150),
                measurement_name = Clamp(reading.MeasurementName, 100),
                axis = ClampNullable(reading.Axis, 10)
            }, transaction, cancellationToken: cancellationToken));
    }

    private static async Task EnsureTablesAsync(MySqlConnection connection, CancellationToken cancellationToken)
    {
        const string sql = """
            CREATE TABLE IF NOT EXISTS measurement_units (
                id INT AUTO_INCREMENT PRIMARY KEY,
                unit_category VARCHAR(50) NOT NULL,
                unit_symbol VARCHAR(20) NOT NULL,
                unit_name VARCHAR(80) NOT NULL,
                is_deleted TINYINT(1) NOT NULL DEFAULT 0,
                created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                UNIQUE KEY uq_measurement_units_category_symbol (unit_category, unit_symbol)
            ) ENGINE=InnoDB;

            CREATE TABLE IF NOT EXISTS utility_sites (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                site_code VARCHAR(50) NOT NULL,
                site_name VARCHAR(150) NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                UNIQUE KEY uq_utility_sites_site_code (site_code)
            ) ENGINE=InnoDB;

            INSERT INTO utility_sites (id, site_code, site_name, is_active)
            VALUES (1, 'BTU-SITE-001', 'Baja Titian Utama Monitoring Site', 1)
            ON DUPLICATE KEY UPDATE site_name = VALUES(site_name), is_active = VALUES(is_active);

            CREATE TABLE IF NOT EXISTS structural_assets (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                site_id BIGINT NOT NULL,
                asset_code VARCHAR(50) NOT NULL,
                asset_name VARCHAR(150) NOT NULL,
                asset_type VARCHAR(50) NOT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                UNIQUE KEY uq_structural_assets_site_asset_code (site_id, asset_code)
            ) ENGINE=InnoDB;

            INSERT INTO structural_assets (id, site_id, asset_code, asset_name, asset_type, is_active)
            VALUES (1, 1, 'BRG-KM-012', 'Bridge KM 12', 'bridge', 1)
            ON DUPLICATE KEY UPDATE asset_name = VALUES(asset_name), asset_type = VALUES(asset_type), is_active = VALUES(is_active);

            CREATE TABLE IF NOT EXISTS sensor_types (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sensor_code VARCHAR(20) NOT NULL,
                sensor_name VARCHAR(100) NOT NULL,
                description VARCHAR(255) NULL,
                default_unit_id INT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                UNIQUE KEY uq_sensor_types_sensor_code (sensor_code)
            ) ENGINE=InnoDB;

            CREATE TABLE IF NOT EXISTS sensor_devices (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                site_id BIGINT NOT NULL,
                asset_id BIGINT NULL,
                zone_id BIGINT NULL,
                sensor_type_id INT NOT NULL,
                device_code VARCHAR(80) NOT NULL,
                device_name VARCHAR(150) NOT NULL,
                status VARCHAR(30) NOT NULL DEFAULT 'active',
                created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                UNIQUE KEY uq_sensor_devices_device_code (device_code)
            ) ENGINE=InnoDB;

            CREATE TABLE IF NOT EXISTS sensor_channels (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                sensor_device_id BIGINT NOT NULL,
                unit_id INT NOT NULL,
                channel_code VARCHAR(80) NOT NULL,
                channel_name VARCHAR(150) NOT NULL,
                measurement_name VARCHAR(100) NOT NULL,
                axis VARCHAR(10) NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                UNIQUE KEY uq_sensor_channels_device_channel_code (sensor_device_id, channel_code)
            ) ENGINE=InnoDB;

            CREATE TABLE IF NOT EXISTS sensor_readings (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                sensor_channel_id BIGINT NOT NULL,
                measured_at DATETIME(6) NOT NULL,
                numeric_value DECIMAL(20, 8) NOT NULL,
                quality_code VARCHAR(30) NOT NULL DEFAULT 'good',
                raw_payload JSON NULL,
                ingested_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                UNIQUE KEY uq_sensor_readings_channel_measured_at (sensor_channel_id, measured_at),
                KEY ix_sensor_readings_measured_at (measured_at)
            ) ENGINE=InnoDB;
            """;

        await connection.ExecuteAsync(new CommandDefinition(sql, cancellationToken: cancellationToken));
    }

    private static string Clamp(string value, int maxLength) =>
        string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : value.Trim()[..Math.Min(value.Trim().Length, maxLength)];

    private static string? ClampNullable(string? value, int maxLength) =>
        string.IsNullOrWhiteSpace(value)
            ? null
            : value.Trim()[..Math.Min(value.Trim().Length, maxLength)];
}
