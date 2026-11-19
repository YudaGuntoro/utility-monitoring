using Microsoft.Extensions.Logging;
using MySql.Data.MySqlClient;
using Worker.Shared;
using Worker.Configuration;

namespace Worker.Infrastructure.Persistence;

public sealed class LogWriterService : ILogWriterService
{
    private readonly ILogger<LogWriterService> _logger;

    public LogWriterService(ILogger<LogWriterService> logger)
    {
        _logger = logger;
    }

    public async Task WaitUntilReadyAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = new MySqlConnection(DatabaseConfig.MysqlConnString);
        await DbRetry.OpenWithRetryAsync(connection, _logger, "LogBuffer", cancellationToken);
        await EnsureLogBufferTableAsync(connection, cancellationToken);
    }

    public async Task WriteRawAsync(
        string topic,
        string payload,
        string status = "pending",
        string? lastError = null,
        CancellationToken cancellationToken = default)
    {
        await using var connection = new MySqlConnection(DatabaseConfig.MysqlConnString);
        await DbRetry.OpenWithRetryAsync(connection, _logger, "LogBuffer", cancellationToken);
        await EnsureLogBufferTableAsync(connection, cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO log_buffer
                (sensor_device_id, device_id, topic, payload, time_stamp, status, retry_count, last_error, uploaded_at, created_at)
            SELECT
                devices.id,
                @device_id,
                @topic,
                @payload,
                CURRENT_TIMESTAMP(6),
                @status,
                0,
                @last_error,
                IF(@status = 'uploaded', CURRENT_TIMESTAMP(6), NULL),
                CURRENT_TIMESTAMP(6)
            FROM (SELECT 1) seed
            LEFT JOIN sensor_devices devices ON devices.device_code = @device_id;
            """;
        command.Parameters.AddWithValue("@device_id", ResolveDeviceId(topic));
        command.Parameters.AddWithValue("@topic", topic);
        command.Parameters.AddWithValue("@payload", payload);
        command.Parameters.AddWithValue("@status", NormalizeStatus(status));
        command.Parameters.AddWithValue("@last_error", string.IsNullOrWhiteSpace(lastError) ? DBNull.Value : lastError);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task EnsureLogBufferTableAsync(MySqlConnection connection, CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS log_buffer (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                sensor_device_id BIGINT NULL,
                device_id VARCHAR(100) NOT NULL,
                topic VARCHAR(255) NULL,
                payload LONGTEXT NOT NULL,
                time_stamp DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                status VARCHAR(30) NOT NULL DEFAULT 'pending',
                retry_count INT NOT NULL DEFAULT 0,
                last_error TEXT NULL,
                uploaded_at DATETIME(6) NULL,
                created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                KEY ix_log_buffer_time_stamp (time_stamp),
                KEY ix_log_buffer_status_time_stamp (status, time_stamp),
                KEY ix_log_buffer_device_time_stamp (device_id, time_stamp),
                KEY ix_log_buffer_sensor_device_id (sensor_device_id)
            ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
            """;
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string ResolveDeviceId(string topic)
    {
        var text = topic.ToUpperInvariant();
        foreach (var sensorCode in new[] { "TILT", "VW", "ATRH", "ACC" })
        {
            if (text.Contains(sensorCode, StringComparison.Ordinal))
            {
                return $"Utility-{sensorCode}-01";
            }
        }

        return string.IsNullOrWhiteSpace(topic) ? "UNKNOWN" : topic;
    }

    private static string NormalizeStatus(string status) =>
        status.Trim().ToLowerInvariant() switch
        {
            "uploaded" => "uploaded",
            "failed" => "failed",
            "ignored" => "ignored",
            _ => "pending"
        };
}
