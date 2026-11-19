using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Worker.Application.Mapping;
using Worker.Infrastructure.Persistence;
using Worker.Application.Handlers;

namespace Worker.Application.Handlers;

public sealed class UtilitySensorHandler : IUtilitySensorHandler
{
    private readonly ILogger<UtilitySensorHandler> _logger;
    private readonly ISensorReadingWriterService _readingWriterService;

    public UtilitySensorHandler(
        ILogger<UtilitySensorHandler> logger,
        ISensorReadingWriterService readingWriterService)
    {
        _logger = logger;
        _readingWriterService = readingWriterService;
    }

    public bool CanHandle(string topic) =>
        !string.IsNullOrWhiteSpace(topic)
        && (topic.Contains("utility", StringComparison.OrdinalIgnoreCase)
            || topic.Contains("tilt", StringComparison.OrdinalIgnoreCase)
            || topic.Contains("atrh", StringComparison.OrdinalIgnoreCase)
            || topic.Contains("vw", StringComparison.OrdinalIgnoreCase)
            || topic.Contains("acc", StringComparison.OrdinalIgnoreCase));

    public async Task InsertAsync(string topic, string payload, CancellationToken cancellationToken = default)
    {
        try
        {
            var readings = UtilityPayloadMapper.ToSensorReadings(topic, payload);
            foreach (var reading in readings)
            {
                var insertedId = await _readingWriterService.InsertAsync(reading, cancellationToken);
                _logger.LogInformation(
                    "[Utility] Inserted reading Id={Id} Device={Device} Channel={Channel} Value={Value} Topic={Topic}",
                    insertedId,
                    reading.DeviceCode,
                    reading.ChannelCode,
                    reading.NumericValue,
                    topic);
            }
        }
        catch (JsonException ex)
        {
            throw new FormatException("MQTT payload must be valid JSON.", ex);
        }
    }
}
