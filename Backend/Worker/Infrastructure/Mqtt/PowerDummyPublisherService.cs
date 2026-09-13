using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Worker.Configuration;

namespace Worker.Infrastructure.Mqtt;

public sealed class PowerDummyPublisherService : BackgroundService
{
    private readonly ILogger<PowerDummyPublisherService> _logger;
    private readonly IMqttPublisher _publisher;
    private readonly Random _random = new();
    private readonly Dictionary<string, decimal> _energies;
    private readonly IReadOnlyList<string> _devices;
    private readonly bool _enabled;
    private readonly TimeSpan _interval;
    private readonly int _qos;

    public PowerDummyPublisherService(ILogger<PowerDummyPublisherService> logger, IMqttPublisher publisher)
    {
        _logger = logger;
        _publisher = publisher;

        var config = Config.Instance;
        _enabled = ReadBoolSetting(config, "Simulator", "Enabled", true, "SIMULATOR_ENABLED");
        _interval = TimeSpan.FromSeconds(Math.Max(1, ReadIntSetting(config, "Simulator", "IntervalSeconds", 5, "SIMULATOR_INTERVAL_SECONDS")));
        _qos = ReadIntSetting(config, "Simulator", "Qos", 1, "SIMULATOR_QOS");
        _devices = ReadDevices(config);
        _energies = _devices.ToDictionary(device => device, _ => 125_000m + (decimal)(_random.NextDouble() * 2_000));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_enabled)
        {
            _logger.LogInformation("[PowerDummy] Disabled.");
            return;
        }

        _logger.LogInformation(
            "[PowerDummy] Started. Devices={Devices} Interval={IntervalSeconds}s",
            string.Join(", ", _devices),
            _interval.TotalSeconds);

        await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            foreach (var device in _devices)
            {
                try
                {
                    var topic = $"utility/power/{device}/telemetry";
                    var payload = JsonSerializer.Serialize(BuildPayload(device));
                    await _publisher.PublishAsync(topic, payload, retain: false, qos: _qos, cancellationToken: stoppingToken);
                    _logger.LogInformation("[PowerDummy] Published {Device} to {Topic}", device, topic);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    return;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[PowerDummy] Publish failed for {Device}. Will retry.", device);
                }
            }

            await Task.Delay(_interval, stoppingToken);
        }
    }

    private object BuildPayload(string device)
    {
        decimal Jitter(decimal center, decimal radius) =>
            center + (decimal)((_random.NextDouble() * 2 - 1) * (double)radius);

        var v1 = Jitter(231m, 4m);
        var v2 = Jitter(230m, 4m);
        var v3 = Jitter(232m, 4m);
        var c1 = Jitter(42m, 8m);
        var c2 = Jitter(41m, 8m);
        var c3 = Jitter(43m, 8m);
        var pf = Math.Clamp(Jitter(0.94m, 0.05m), 0.85m, 1.0m);
        var activeKw = Math.Round((v1 * c1 + v2 * c2 + v3 * c3) * pf / 1000m, 2);
        var apparentKva = Math.Round(activeKw / Math.Max(pf, 0.01m), 2);
        var reactiveKvar = Math.Round((decimal)Math.Sqrt(Math.Max(0, (double)(apparentKva * apparentKva - activeKw * activeKw))), 2);
        _energies[device] += activeKw * (decimal)_interval.TotalSeconds / 3600m;

        return new
        {
            deviceCode = device,
            timestamp = DateTimeOffset.UtcNow,
            status = "online",
            measurements = new
            {
                voltage = new
                {
                    l1n = Math.Round(v1, 1),
                    l2n = Math.Round(v2, 1),
                    l3n = Math.Round(v3, 1),
                    l1l2 = Math.Round(Jitter(399m, 5m), 1),
                    l2l3 = Math.Round(Jitter(400m, 5m), 1),
                    l3l1 = Math.Round(Jitter(398m, 5m), 1)
                },
                current = new
                {
                    l1 = Math.Round(c1, 1),
                    l2 = Math.Round(c2, 1),
                    l3 = Math.Round(c3, 1),
                    neutral = Math.Round(Jitter(2m, 1m), 1)
                },
                power = new
                {
                    active_kw = activeKw,
                    reactive_kvar = reactiveKvar,
                    apparent_kva = apparentKva,
                    power_factor = Math.Round(pf, 3)
                },
                frequency_hz = Math.Round(Jitter(50.0m, 0.05m), 2),
                energy = new
                {
                    import_kwh = Math.Round(_energies[device], 2),
                    export_kwh = Math.Round(Jitter(120m, 4m), 2)
                }
            }
        };
    }

    private static IReadOnlyList<string> ReadDevices(Config config)
    {
        var devices = config.ReadList("Devices", "Simulator");
        if (devices.Count == 0)
        {
            var environment = Environment.GetEnvironmentVariable("SIMULATOR_DEVICES");
            devices = string.IsNullOrWhiteSpace(environment)
                ? new[] { "PM-01", "PM-02", "PM-03" }
                : environment.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        }

        return devices
            .Select(device => device.Trim().ToUpperInvariant())
            .Where(device => !string.IsNullOrWhiteSpace(device))
            .Distinct()
            .ToList();
    }

    private static bool ReadBoolSetting(Config config, string section, string key, bool defaultValue, params string[] environmentKeys)
    {
        var value = ReadSetting(config, section, key, environmentKeys);
        if (string.IsNullOrWhiteSpace(value))
        {
            return defaultValue;
        }

        return value.Equals("true", StringComparison.OrdinalIgnoreCase)
            || value.Equals("1", StringComparison.OrdinalIgnoreCase)
            || value.Equals("yes", StringComparison.OrdinalIgnoreCase)
            || value.Equals("on", StringComparison.OrdinalIgnoreCase);
    }

    private static int ReadIntSetting(Config config, string section, string key, int defaultValue, params string[] environmentKeys)
    {
        var value = ReadSetting(config, section, key, environmentKeys);
        return int.TryParse(value, out var result) ? result : config.ReadInt(key, section, defaultValue);
    }

    private static string? ReadSetting(Config config, string section, string key, params string[] environmentKeys)
    {
        foreach (var variable in environmentKeys)
        {
            var environmentValue = Environment.GetEnvironmentVariable(variable);
            if (!string.IsNullOrWhiteSpace(environmentValue))
            {
                return environmentValue.Trim();
            }
        }

        return config.Read(key, section);
    }
}
