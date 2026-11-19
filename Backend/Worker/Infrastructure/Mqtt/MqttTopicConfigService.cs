using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Worker.Configuration;
using Web.API.Domain.Production;
using Web.API.Persistence.Context;

namespace Worker.Infrastructure.Mqtt;

public sealed class MqttTopicConfigService
{
	private readonly ILogger<MqttTopicConfigService> _logger;

	private readonly IDbContextFactory<AppDbContext> _dbContextFactory;

	private static readonly MqttSensorTopicConfig[] DefaultTopics =
	[
		new() { Code = "POWER", Name = "Power Monitoring Telemetry", Topic = "utility/power/+/telemetry", Qos = 1, Enabled = true },
        new() { Code = "WATER", Name = "Water Monitoring", Topic = "utility/water/+/telemetry", Qos = 1, Enabled = true },
        new() { Code = "AIR", Name = "Compressed Air Monitoring", Topic = "utility/compressed-air/+/telemetry", Qos = 1, Enabled = true },
		new() { Code = "TILT", Name = "Tilt Sensor", Topic = "utility/tilt01/raw", Qos = 1, Enabled = true },
		new() { Code = "VW", Name = "Vibrating Wire Sensor", Topic = "utility/vw01/raw", Qos = 1, Enabled = true },
		new() { Code = "ATRH", Name = "Air Temperature & RH Sensor", Topic = "utility/atrh01/raw", Qos = 1, Enabled = true },
		new() { Code = "ACC", Name = "Accelerometer Sensor", Topic = "utility/acc03/raw", Qos = 1, Enabled = true }
	];

	public MqttTopicConfigService(ILogger<MqttTopicConfigService> logger, IDbContextFactory<AppDbContext> dbContextFactory)
	{
		_logger = logger;
		_dbContextFactory = dbContextFactory;
	}

	public async Task<IReadOnlyList<MqttSubscriptionTopic>> GetActiveTopicsAsync(CancellationToken cancellationToken = default(CancellationToken))
	{
		try
		{
			await using AppDbContext context = await _dbContextFactory.CreateDbContextAsync(cancellationToken);
			await EnsureMqttSensorTopicsTableAsync(context, cancellationToken);

			List<MqttSubscriptionTopic> topics = await context.MqttSensorTopicConfigs
				.AsNoTracking()
				.Where(topic => topic.Enabled && topic.Topic != string.Empty)
				.OrderBy(topic => topic.Code == "POWER" ? 0 : topic.Code == "TILT" ? 1 : topic.Code == "VW" ? 2 : topic.Code == "ATRH" ? 3 : topic.Code == "ACC" ? 4 : 5)
				.ThenBy(topic => topic.Code)
				.Select(topic => new MqttSubscriptionTopic(topic.Topic.Trim(), Math.Clamp(topic.Qos, 0, 2)))
				.ToListAsync(cancellationToken);

			if (!topics.Any(x => string.Equals(x.Topic, "utility/power/+/telemetry", StringComparison.OrdinalIgnoreCase)))
			{
				topics.Add(new MqttSubscriptionTopic("utility/power/+/telemetry", 1));
			}

			return topics
				.Where(topic => !string.IsNullOrWhiteSpace(topic.Topic))
				.GroupBy(topic => topic.Topic, StringComparer.OrdinalIgnoreCase)
				.Select(group => group.First())
				.ToList();
		}
		catch (Exception ex) when (!(ex is OperationCanceledException))
		{
			_logger.LogWarning(ex, "[MQTT] Failed to load topic configuration from database. Falling back to Settings.ini.");
			return Array.Empty<MqttSubscriptionTopic>();
		}
	}

	private static async Task EnsureMqttSensorTopicsTableAsync(AppDbContext context, CancellationToken cancellationToken)
	{
		await context.Database.ExecuteSqlRawAsync(@"
CREATE TABLE IF NOT EXISTS mqtt_sensor_topics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sensor_type_id INT NULL,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    topic VARCHAR(255) NOT NULL,
    qos INT NOT NULL DEFAULT 1,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_mqtt_sensor_topics_code (code),
    INDEX ix_mqtt_sensor_topics_enabled (enabled)
);", cancellationToken);

		List<MqttSensorTopicConfig> existingTopics = await context.MqttSensorTopicConfigs.ToListAsync(cancellationToken);
		foreach (MqttSensorTopicConfig defaultTopic in DefaultTopics)
		{
			MqttSensorTopicConfig? existing = existingTopics.FirstOrDefault(topic => string.Equals(topic.Code, defaultTopic.Code, StringComparison.OrdinalIgnoreCase));
			if (existing is null)
			{
				context.MqttSensorTopicConfigs.Add(Clone(defaultTopic));
				continue;
			}

			if (IsLegacyDefaultTopic(existing))
			{
				existing.Topic = defaultTopic.Topic;
				existing.Qos = Math.Clamp(existing.Qos, 0, 2);
				existing.UpdatedAt = DateTime.Now;
			}

			if (string.IsNullOrWhiteSpace(existing.Name))
			{
				existing.Name = defaultTopic.Name;
			}
		}

		await context.SaveChangesAsync(cancellationToken);
	}

	private static MqttSensorTopicConfig Clone(MqttSensorTopicConfig source) =>
		new()
		{
			Code = source.Code,
			Name = source.Name,
			Topic = source.Topic,
			Qos = source.Qos,
			Enabled = source.Enabled,
			CreatedAt = DateTime.Now,
			UpdatedAt = DateTime.Now
		};

	private static bool IsLegacyDefaultTopic(MqttSensorTopicConfig topic) =>
		(topic.Code.Trim().ToUpperInvariant(), NormalizeTopic(topic.Topic)) switch
		{
			("TILT", "utility/tilt") => true,
			("VW", "utility/vw") => true,
			("ATRH", "utility/atrh") => true,
			("ACC", "utility/acc") => true,
			_ => false
		};

	private static string NormalizeTopic(string topic) =>
		string.Join('/', topic.Trim().Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
}
