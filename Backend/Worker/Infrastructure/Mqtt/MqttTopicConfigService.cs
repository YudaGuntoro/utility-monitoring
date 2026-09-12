using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using MySql.Data.MySqlClient;
using Worker.Configuration;

namespace Worker.Infrastructure.Mqtt;

public sealed class MqttTopicConfigService
{
	private readonly ILogger<MqttTopicConfigService> _logger;

	public MqttTopicConfigService(ILogger<MqttTopicConfigService> logger)
	{
		_logger = logger;
	}

	public async Task<IReadOnlyList<MqttSubscriptionTopic>> GetActiveTopicsAsync(CancellationToken cancellationToken = default(CancellationToken))
	{
		try
		{
			IReadOnlyList<MqttSubscriptionTopic> result;
			await using (MySqlConnection connection = new MySqlConnection(DatabaseConfig.MysqlConnString))
			{
				await connection.OpenAsync(cancellationToken);
				await EnsureMqttSensorTopicsTableAsync(connection, cancellationToken);
				IReadOnlyList<MqttSubscriptionTopic> readOnlyList2;
				await using (MySqlCommand command = connection.CreateCommand())
				{
					command.CommandText = "\nSELECT topic, qos\nFROM mqtt_sensor_topics\nWHERE enabled = 1\n  AND topic IS NOT NULL\n  AND TRIM(topic) <> ''\nORDER BY FIELD(code, 'TILT', 'VW', 'ATRH', 'ACC'), code;";
					List<MqttSubscriptionTopic> topics = new List<MqttSubscriptionTopic>();
					IReadOnlyList<MqttSubscriptionTopic> readOnlyList;
					await using (DbDataReader reader = await command.ExecuteReaderAsync(cancellationToken))
					{
						while (await reader.ReadAsync(cancellationToken))
						{
							topics.Add(new MqttSubscriptionTopic(reader.GetString(0).Trim(), Math.Clamp(reader.GetInt32(1), 0, 2)));
						}
						if (!topics.Any(x => string.Equals(x.Topic, "utility/power/+/telemetry", StringComparison.OrdinalIgnoreCase)))
						{
							topics.Add(new MqttSubscriptionTopic("utility/power/+/telemetry", 1));
						}
						readOnlyList = (from x in topics.GroupBy<MqttSubscriptionTopic, string>((MqttSubscriptionTopic x) => x.Topic, StringComparer.OrdinalIgnoreCase)
							select x.First()).ToList();
					}
					readOnlyList2 = readOnlyList;
				}
				result = readOnlyList2;
			}
			return result;
		}
		catch (Exception ex) when (!(ex is OperationCanceledException))
		{
			_logger.LogWarning(ex, "[MQTT] Failed to load topic configuration from database. Falling back to Settings.ini.");
			return Array.Empty<MqttSubscriptionTopic>();
		}
	}

	private static async Task EnsureMqttSensorTopicsTableAsync(MySqlConnection connection, CancellationToken cancellationToken)
	{
		await using MySqlCommand command = connection.CreateCommand();
	command.CommandText = "\nCREATE TABLE IF NOT EXISTS mqtt_sensor_topics (\n    id INT AUTO_INCREMENT PRIMARY KEY,\n    code VARCHAR(20) NOT NULL,\n    name VARCHAR(100) NOT NULL,\n    topic VARCHAR(255) NOT NULL,\n    qos INT NOT NULL DEFAULT 1,\n    enabled TINYINT(1) NOT NULL DEFAULT 1,\n    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n    UNIQUE KEY uq_mqtt_sensor_topics_code (code),\n    INDEX ix_mqtt_sensor_topics_enabled (enabled)\n);\n\nINSERT INTO mqtt_sensor_topics\n    (code, name, topic, qos, enabled)\nVALUES\n    ('POWER', 'Power Monitoring Telemetry', 'utility/power/+/telemetry', 1, 1)\nON DUPLICATE KEY UPDATE\n    name = VALUES(name),\n    topic = VALUES(topic),\n    qos = VALUES(qos),\n    enabled = 1,\n    updated_at = CURRENT_TIMESTAMP;";
		await command.ExecuteNonQueryAsync(cancellationToken);
	}
}
