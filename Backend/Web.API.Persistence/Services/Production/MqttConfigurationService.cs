using System.Globalization;
using Web.API.Domain.Production;
using Web.API.Persistence.Repositories.Production;

namespace Web.API.Persistence.Services.Production;

public sealed class MqttConfigurationService : IMqttConfigurationService
{
    private static readonly MqttSensorTopicConfig[] DefaultTopics =
    [
        new() { Code = "TILT", Name = "Tilt Sensor", Topic = "shms/tilt", Qos = 1, Enabled = true },
        new() { Code = "VW", Name = "Vibrating Wire Sensor", Topic = "shms/vw", Qos = 1, Enabled = true },
        new() { Code = "ATRH", Name = "Air Temperature & RH Sensor", Topic = "shms/atrh", Qos = 1, Enabled = true },
        new() { Code = "ACC", Name = "Accelerometer Sensor", Topic = "shms/acc", Qos = 1, Enabled = true }
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
        var missingDefaults = DefaultTopics
            .Where(defaultTopic => existing.All(item => item.Code != defaultTopic.Code))
            .Select(Clone)
            .ToList();

        if (missingDefaults.Count > 0)
        {
            await _repository.UpsertTopicsAsync(missingDefaults, cancellationToken);
        }
    }

    private static MqttConfigurationResponse BuildResponse(IReadOnlyList<MqttSensorTopicConfig> topics) =>
        new()
        {
            BrokerHost = "emqx.broker.io",
            BrokerPort = 1883.ToString(CultureInfo.InvariantCulture),
            ClientId = "SHMSClient",
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
            var normalizedTopic = topic?.Topic?.Trim();

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

    private static string TrimTo(string value, int maxLength)
    {
        var trimmed = value.Trim();
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }
}
