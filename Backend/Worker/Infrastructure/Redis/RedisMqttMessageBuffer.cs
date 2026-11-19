using Newtonsoft.Json;
using StackExchange.Redis;
using Worker.Configuration;
using Worker.Domain.Models;

namespace Worker.Infrastructure.Redis;

public sealed class RedisMqttMessageBuffer : IRedisMqttMessageBuffer
{
    private readonly ILogger<RedisMqttMessageBuffer> _logger;
    private readonly Lazy<ConnectionMultiplexer> _redis;
    private readonly string _bufferKey;

    public RedisMqttMessageBuffer(ILogger<RedisMqttMessageBuffer> logger)
    {
        _logger = logger;
        var connectionString = ReadSetting("ConnectionString", "Redis", "REDIS_CONNECTION_STRING") ?? "localhost:6379";
        _bufferKey = ReadSetting("BufferKey", "Redis", "REDIS_BUFFER_KEY") ?? "utility:mqtt:buffer";
        _redis = new Lazy<ConnectionMultiplexer>(() => ConnectionMultiplexer.Connect(connectionString));
    }

    public async Task EnqueueAsync(BufferedMqttMessage message, CancellationToken cancellationToken = default)
    {
        var payload = JsonConvert.SerializeObject(message);
        await Database.ListRightPushAsync(_bufferKey, payload);
    }

    public async Task<IReadOnlyList<BufferedMqttMessage>> PeekAsync(int maxItems, CancellationToken cancellationToken = default)
    {
        var values = await Database.ListRangeAsync(_bufferKey, 0, Math.Max(0, maxItems - 1));
        var messages = new List<BufferedMqttMessage>();

        foreach (var value in values)
        {
            if (!value.HasValue)
            {
                continue;
            }

            try
            {
                var message = JsonConvert.DeserializeObject<BufferedMqttMessage>(value!);
                if (message != null)
                {
                    messages.Add(message);
                }
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "[Redis] Invalid buffered MQTT message skipped.");
            }
        }

        return messages;
    }

    public async Task RemoveAsync(int count, CancellationToken cancellationToken = default)
    {
        for (var index = 0; index < count; index++)
        {
            await Database.ListLeftPopAsync(_bufferKey);
        }
    }

    public async Task<long> CountAsync(CancellationToken cancellationToken = default) =>
        await Database.ListLengthAsync(_bufferKey);

    private IDatabase Database => _redis.Value.GetDatabase();

    private static string? ReadSetting(string key, string section, params string[] environmentKeys)
    {
        foreach (var variable in environmentKeys)
        {
            var value = Environment.GetEnvironmentVariable(variable);
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }

        return Config.Instance.Read(key, section);
    }
}
