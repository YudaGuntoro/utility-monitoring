using Newtonsoft.Json;
using StackExchange.Redis;
using Worker.Domain.Models;
using Worker.Infrastructure.Http;
using Worker.Infrastructure.Persistence;
using Worker.Infrastructure.Redis;
using Worker.Configuration;

namespace Worker.Application.Handlers;

public sealed class MqttMessageRouter : IMqttMessageHandler
{
    private readonly ILogger<MqttMessageRouter> _logger;
    private readonly IMainServerUploader _mainServerUploader;
    private readonly ILogWriterService _logWriterService;
    private readonly IShmsSensorHandler _sensorHandler;
    private readonly IPowerTelemetryWriterService _powerTelemetryWriter;
    private readonly IRedisMqttMessageBuffer _redisBuffer;
    private readonly ISyncStatusWriterService _syncStatusWriter;
    private readonly int _maxReprocessBatch;
    private readonly TimeSpan _databaseFallbackThreshold;
    private DateTime? _outageStartedAt;

    public MqttMessageRouter(
        ILogger<MqttMessageRouter> logger,
        IMainServerUploader mainServerUploader,
        ILogWriterService logWriterService,
        IShmsSensorHandler sensorHandler,
        IPowerTelemetryWriterService powerTelemetryWriter,
        IRedisMqttMessageBuffer redisBuffer,
        ISyncStatusWriterService syncStatusWriter)
    {
        _logger = logger;
        _mainServerUploader = mainServerUploader;
        _logWriterService = logWriterService;
        _sensorHandler = sensorHandler;
        _powerTelemetryWriter = powerTelemetryWriter;
        _redisBuffer = redisBuffer;
        _syncStatusWriter = syncStatusWriter;
        _maxReprocessBatch = Math.Max(1, Config.Instance.ReadInt("MaxReprocessBatch", "Buffer", 100));
        _databaseFallbackThreshold = TimeSpan.FromMinutes(
            Math.Max(1, ReadIntSetting("DowntimeDatabaseFallbackMinutes", "Worker", 10, "WORKER_DOWNTIME_DATABASE_FALLBACK_MINUTES")));
    }

    public async Task WaitUntilReadyAsync(CancellationToken cancellationToken = default)
    {
        if (!_mainServerUploader.IsConfigured)
        {
            _logger.LogWarning("[MainServer] UploadUrl is not configured. Worker will buffer to Redis and fallback to local database after {Minutes} minute(s).", _databaseFallbackThreshold.TotalMinutes);
        }

        await _logWriterService.WaitUntilReadyAsync(cancellationToken);
        await _powerTelemetryWriter.WaitUntilReadyAsync(cancellationToken);
    }

    public async Task HandleAsync(string topic, string payload, CancellationToken cancellationToken = default)
    {
        if (await _powerTelemetryWriter.UpsertAsync(topic, payload, cancellationToken))
        {
            await _logWriterService.WriteRawAsync(topic, payload, "uploaded", cancellationToken: cancellationToken);
            return;
        }

        var uploadResult = await _mainServerUploader.UploadAsync(topic, payload, cancellationToken);
        if (uploadResult.Success)
        {
            await MarkUploadSuccessAsync(topic, payload, cancellationToken);
            await ReprocessBufferAsync(cancellationToken);
            return;
        }

        await MarkUploadFailureAsync(topic, payload, uploadResult.Error ?? "Upload failed.", cancellationToken);
    }

    public async Task ReprocessBufferAsync(CancellationToken cancellationToken = default)
    {
        IReadOnlyList<BufferedMqttMessage> messages;
        try
        {
            messages = await _redisBuffer.PeekAsync(_maxReprocessBatch, cancellationToken);
        }
        catch (RedisException ex)
        {
            _logger.LogError(ex, "[Redis] Unable to read MQTT buffer.");
            return;
        }

        if (messages.Count == 0)
        {
            return;
        }

        var processed = 0;
        var movedToDatabase = 0;
        foreach (var message in messages)
        {
            var uploadResult = await _mainServerUploader.UploadAsync(message.Topic, message.Payload, cancellationToken);
            if (uploadResult.Success)
            {
                await MarkUploadSuccessAsync(message.Topic, message.Payload, cancellationToken);
                processed++;
                continue;
            }

            EnsureOutageStarted(message.BufferedAt);
            if (!ShouldFallbackToDatabase())
            {
                await UpdateFailureStatusAsync(uploadResult.Error ?? "Upload failed.", cancellationToken);
                break;
            }

            await PersistToLocalDatabaseAsync(message.Topic, message.Payload, uploadResult.Error ?? message.Error ?? "Upload failed.", cancellationToken);
            processed++;
            movedToDatabase++;
        }

        if (processed > 0)
        {
            await _redisBuffer.RemoveAsync(processed, cancellationToken);
            var count = await SafeRedisCountAsync(cancellationToken);
            if (movedToDatabase > 0)
            {
                await _syncStatusWriter.MarkDatabaseFallbackAsync(_mainServerUploader.UploadUrl, count, movedToDatabase, cancellationToken);
            }

            _logger.LogInformation("[Redis] Processed {Count} buffered MQTT message(s). Remaining={Remaining}", processed, count);
        }
    }

    private async Task MarkUploadSuccessAsync(string topic, string payload, CancellationToken cancellationToken)
    {
        _outageStartedAt = null;
        await _logWriterService.WriteRawAsync(topic, payload, "uploaded", cancellationToken: cancellationToken);
        await PersistSensorReadingIfValidAsync(topic, payload, cancellationToken);
        await _syncStatusWriter.MarkSuccessAsync(_mainServerUploader.UploadUrl, await SafeRedisCountAsync(cancellationToken), cancellationToken);
    }

    private async Task MarkUploadFailureAsync(string topic, string payload, string error, CancellationToken cancellationToken)
    {
        EnsureOutageStarted(DateTime.Now);

        var message = new BufferedMqttMessage
        {
            BufferedAt = DateTime.Now,
            RawLogged = false,
            Topic = topic,
            Payload = payload,
            Error = error
        };

        try
        {
            await _redisBuffer.EnqueueAsync(message, cancellationToken);
        }
        catch (RedisException ex)
        {
            _logger.LogError(ex, "[Redis] Unable to buffer MQTT message. Falling back to local database immediately.");
            await PersistToLocalDatabaseAsync(topic, payload, $"Redis unavailable. Upload error: {error}", cancellationToken);
            await _syncStatusWriter.MarkFailureAsync(_mainServerUploader.UploadUrl, error, 0, cancellationToken);
            return;
        }

        var redisCount = await SafeRedisCountAsync(cancellationToken);
        await UpdateFailureStatusAsync(error, cancellationToken);

        if (ShouldFallbackToDatabase())
        {
            await ReprocessBufferAsync(cancellationToken);
        }
        else
        {
            _logger.LogWarning(
                "[MainServer] Upload failed. Buffered in Redis. Downtime={DowntimeSeconds}s RedisCount={RedisCount}",
                Math.Round((DateTime.Now - _outageStartedAt.GetValueOrDefault(DateTime.Now)).TotalSeconds),
                redisCount);
        }
    }

    private async Task PersistToLocalDatabaseAsync(string topic, string payload, string error, CancellationToken cancellationToken)
    {
        await _logWriterService.WriteRawAsync(topic, payload, "failed", error, cancellationToken);
        await PersistSensorReadingIfValidAsync(topic, payload, cancellationToken);
    }

    private async Task PersistSensorReadingIfValidAsync(string topic, string payload, CancellationToken cancellationToken)
    {
        if (!_sensorHandler.CanHandle(topic))
        {
            return;
        }

        try
        {
            await _sensorHandler.InsertAsync(topic, payload, cancellationToken);
        }
        catch (Exception ex) when (ex is FormatException or JsonException)
        {
            _logger.LogWarning(ex, "[SHMS] MQTT payload was logged but not inserted as sensor reading. Topic={Topic}", topic);
        }
    }

    private async Task UpdateFailureStatusAsync(string error, CancellationToken cancellationToken)
    {
        var count = await SafeRedisCountAsync(cancellationToken);
        await _syncStatusWriter.MarkFailureAsync(_mainServerUploader.UploadUrl, error, count, cancellationToken);
    }

    private void EnsureOutageStarted(DateTime fallbackStart)
    {
        _outageStartedAt ??= fallbackStart;
    }

    private bool ShouldFallbackToDatabase() =>
        _outageStartedAt.HasValue && DateTime.Now - _outageStartedAt.Value >= _databaseFallbackThreshold;

    private async Task<long> SafeRedisCountAsync(CancellationToken cancellationToken)
    {
        try
        {
            return await _redisBuffer.CountAsync(cancellationToken);
        }
        catch (RedisException)
        {
            return 0;
        }
    }

    private static int ReadIntSetting(string key, string section, int defaultValue, params string[] environmentKeys)
    {
        foreach (var variable in environmentKeys)
        {
            var value = Environment.GetEnvironmentVariable(variable);
            if (int.TryParse(value, out var parsed))
            {
                return parsed;
            }
        }

        return Config.Instance.ReadInt(key, section, defaultValue);
    }
}
