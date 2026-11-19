using System.Globalization;
using Web.API.Domain.Production;
using Web.API.Persistence.Repositories.Production;

namespace Web.API.Persistence.Services.Production;

public sealed class MqttConfigurationService : IMqttConfigurationService
{
    private static readonly MqttSensorTopicConfig[] DefaultTopics =
    [
        new() { Code = "POWER", Name = "Power Monitoring", Topic = "utility/power/+/telemetry", Qos = 1, Enabled = true },
        new() { Code = "WATER", Name = "Water Monitoring", Topic = "utility/water/+/telemetry", Qos = 1, Enabled = true },
        new() { Code = "AIR", Name = "Compressed Air", Topic = "utility/compressed-air/+/telemetry", Qos = 1, Enabled = true },
        new() { Code = "TILT", Name = "Tilt Sensor", Topic = "utility/tilt01/raw", Qos = 1, Enabled = true },
        new() { Code = "VW", Name = "Vibrating Wire Sensor", Topic = "utility/vw01/raw", Qos = 1, Enabled = true },
        new() { Code = "ATRH", Name = "Air Temperature & RH Sensor", Topic = "utility/atrh01/raw", Qos = 1, Enabled = true },
        new() { Code = "ACC", Name = "Accelerometer Sensor", Topic = "utility/acc03/raw", Qos = 1, Enabled = true }
    ];

    private readonly IMqttConfigurationRepository _repository;

    public MqttConfigurationService(IMqttConfigurationRepository repository)
    {
        _repository = repository;
    }

    public async Task<MqttConfigurationResponse> GetAsync(CancellationToken cancellationToken = default)
    {
        await EnsureDefaultsAsync(cancellationToken);
        return BuildResponse(await _repository.GetTopicsAsync(cancellationToken));
    }

    public async Task<MqttConfigurationResponse> UpdateAsync(
        UpdateMqttConfigurationRequest request,
        CancellationToken cancellationToken = default)
    {
        await _repository.EnsureTableAsync(cancellationToken);
        await _repository.UpsertTopicsAsync(NormalizeTopics(request.Topics), cancellationToken);
        return BuildResponse(await _repository.GetTopicsAsync(cancellationToken));
    }

    private async Task EnsureDefaultsAsync(CancellationToken cancellationToken)
    {
        await _repository.EnsureTableAsync(cancellationToken);
        var existing = await _repository.GetTopicsAsync(cancellationToken);
        var defaultUpdates = DefaultTopics
            .Select(defaultTopic => BuildDefaultUpdate(defaultTopic, existing.FirstOrDefault(item => item.Code == defaultTopic.Code)))
            .Where(topic => topic is not null)
            .Select(topic => topic!)
            .ToList();

        if (defaultUpdates.Count > 0)
        {
            await _repository.UpsertTopicsAsync(defaultUpdates, cancellationToken);
        }
    }

    private static MqttConfigurationResponse BuildResponse(IReadOnlyList<MqttSensorTopicConfig> topics) =>
        new()
        {
            BrokerHost = "127.0.0.1",
            BrokerPort = 1883.ToString(CultureInfo.InvariantCulture),
            ClientId = "UtilityClient",
            Topics = topics.ToList()
        };

    private static IReadOnlyList<MqttSensorTopicConfig> NormalizeTopics(IEnumerable<MqttSensorTopicConfig>? topics)
    {
        var requested = topics?
            .Where(x => !string.IsNullOrWhiteSpace(x.Code))
            .ToDictionary(x => x.Code.Trim().ToUpperInvariant(), x => x, StringComparer.OrdinalIgnoreCase)
            ?? new Dictionary<string, MqttSensorTopicConfig>(StringComparer.OrdinalIgnoreCase);

        return DefaultTopics.Select(defaultTopic =>
        {
            requested.TryGetValue(defaultTopic.Code, out var topic);
            var normalizedTopic = NormalizeTopic(topic?.Topic);

            return new MqttSensorTopicConfig
            {
                Code = defaultTopic.Code,
                Name = string.IsNullOrWhiteSpace(topic?.Name) ? defaultTopic.Name : TrimTo(topic.Name, 100),
                Topic = string.IsNullOrWhiteSpace(normalizedTopic) ? defaultTopic.Topic : TrimTo(normalizedTopic, 255),
                Qos = Math.Clamp(topic?.Qos ?? defaultTopic.Qos, 0, 2),
                Enabled = topic?.Enabled ?? defaultTopic.Enabled
            };
        }).ToList();
    }

    private static MqttSensorTopicConfig Clone(MqttSensorTopicConfig source) =>
        new()
        {
            Code = source.Code,
            Name = source.Name,
            Topic = source.Topic,
            Qos = source.Qos,
            Enabled = source.Enabled
        };

    private static MqttSensorTopicConfig? BuildDefaultUpdate(MqttSensorTopicConfig defaultTopic, MqttSensorTopicConfig? existing)
    {
        if (existing is null)
        {
            return Clone(defaultTopic);
        }

        if (!IsLegacyDefaultTopic(existing))
        {
            return null;
        }

        return new MqttSensorTopicConfig
        {
            Code = defaultTopic.Code,
            Name = string.IsNullOrWhiteSpace(existing.Name) ? defaultTopic.Name : existing.Name,
            Topic = defaultTopic.Topic,
            Qos = Math.Clamp(existing.Qos, 0, 2),
            Enabled = existing.Enabled
        };
    }

    private static bool IsLegacyDefaultTopic(MqttSensorTopicConfig topic) =>
        (topic.Code.Trim().ToUpperInvariant(), NormalizeTopic(topic.Topic)) switch
        {
            ("TILT", "utility/tilt") => true,
            ("VW", "utility/vw") => true,
            ("ATRH", "utility/atrh") => true,
            ("ACC", "utility/acc") => true,
            _ => false
        };

    private static string TrimTo(string value, int maxLength)
    {
        var trimmed = value.Trim();
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }

    private static string NormalizeTopic(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return string.Join(
            '/',
            value.Trim().Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }
}
