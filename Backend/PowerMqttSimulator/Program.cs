using System.Text;
using System.Text.Json;
using MQTTnet;
using MQTTnet.Client;

var host = Read("MQTT_HOST", "127.0.0.1");
var port = int.TryParse(Environment.GetEnvironmentVariable("MQTT_PORT"), out var parsedPort) ? parsedPort : 1883;
var username = Environment.GetEnvironmentVariable("MQTT_USERNAME");
var password = Environment.GetEnvironmentVariable("MQTT_PASSWORD");
var clientId = Read("MQTT_CLIENT_ID", $"PowerSimulator-{Environment.MachineName}");
var intervalSeconds = int.TryParse(Environment.GetEnvironmentVariable("SIMULATOR_INTERVAL_SECONDS"), out var parsedInterval) ? Math.Max(1, parsedInterval) : 5;
var devices = Read("SIMULATOR_DEVICES", "PM-01,PM-02,PM-03,PM-04,PM-05")
    .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);

var random = new Random();
var energies = devices.ToDictionary(device => device, _ => 125_000m + (decimal)(random.NextDouble() * 2_000));
var factory = new MqttFactory();
using var client = factory.CreateMqttClient();

var optionsBuilder = new MqttClientOptionsBuilder()
    .WithClientId(clientId)
    .WithTcpServer(host, port)
    .WithKeepAlivePeriod(TimeSpan.FromSeconds(30));

if (!string.IsNullOrWhiteSpace(username))
{
    optionsBuilder.WithCredentials(username, password ?? string.Empty);
}

await client.ConnectAsync(optionsBuilder.Build(), CancellationToken.None);
Console.WriteLine($"Power MQTT simulator connected to {host}:{port}. Devices: {string.Join(", ", devices)}");

while (true)
{
    foreach (var device in devices)
    {
        var payload = BuildPayload(device);
        var topic = $"utility/power/{device}/telemetry";
        var message = new MqttApplicationMessageBuilder()
            .WithTopic(topic)
            .WithPayload(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload)))
            .WithQualityOfServiceLevel(MQTTnet.Protocol.MqttQualityOfServiceLevel.AtLeastOnce)
            .Build();

        await client.PublishAsync(message, CancellationToken.None);
        Console.WriteLine($"{DateTimeOffset.Now:O} published {device}");
    }

    await Task.Delay(TimeSpan.FromSeconds(intervalSeconds));
}

object BuildPayload(string device)
{
    decimal jitter(decimal center, decimal radius) => center + (decimal)((random.NextDouble() * 2 - 1) * (double)radius);
    var v1 = jitter(231m, 4m);
    var v2 = jitter(230m, 4m);
    var v3 = jitter(232m, 4m);
    var c1 = jitter(42m, 8m);
    var c2 = jitter(41m, 8m);
    var c3 = jitter(43m, 8m);
    var pf = Math.Clamp(jitter(0.94m, 0.05m), 0.85m, 1.0m);
    var activeKw = Math.Round((v1 * c1 + v2 * c2 + v3 * c3) * pf / 1000m, 2);
    var apparentKva = Math.Round(activeKw / Math.Max(pf, 0.01m), 2);
    var reactiveKvar = Math.Round((decimal)Math.Sqrt(Math.Max(0, (double)(apparentKva * apparentKva - activeKw * activeKw))), 2);
    energies[device] += activeKw * intervalSeconds / 3600m;

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
                l1l2 = Math.Round(jitter(399m, 5m), 1),
                l2l3 = Math.Round(jitter(400m, 5m), 1),
                l3l1 = Math.Round(jitter(398m, 5m), 1)
            },
            current = new
            {
                l1 = Math.Round(c1, 1),
                l2 = Math.Round(c2, 1),
                l3 = Math.Round(c3, 1),
                neutral = Math.Round(jitter(2m, 1m), 1)
            },
            power = new
            {
                active_kw = activeKw,
                reactive_kvar = reactiveKvar,
                apparent_kva = apparentKva,
                power_factor = Math.Round(pf, 3)
            },
            frequency_hz = Math.Round(jitter(50.0m, 0.05m), 2),
            energy = new
            {
                import_kwh = Math.Round(energies[device], 2),
                export_kwh = Math.Round(jitter(120m, 4m), 2)
            }
        }
    };
}

static string Read(string key, string fallback) =>
    string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key))
        ? fallback
        : Environment.GetEnvironmentVariable(key)!.Trim();
