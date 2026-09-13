using MQTTnet.Protocol;
using MQTTnet.Server;

namespace MqttBrokerService;

public sealed class MqttBrokerWorker : BackgroundService
{
    private const string DefaultHost = "127.0.0.1";
    private const int DefaultPort = 1883;

    private readonly ILogger<MqttBrokerWorker> _logger;
    private MqttServer? _mqttServer;

    public MqttBrokerWorker(ILogger<MqttBrokerWorker> logger)
    {
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var settings = BrokerSettings.Load();
        _logger.LogInformation(
            "[MQTT Broker] Starting. BaseDirectory={BaseDirectory} SettingsPath={SettingsPath} Host={Host} ParsedHost={ParsedHost} Port={Port} Auth={AuthMode}",
            AppContext.BaseDirectory,
            BrokerSettings.SettingsPath,
            settings.HostText,
            settings.Host,
            settings.Port,
            settings.RequiresAuthentication ? "Enabled" : "Disabled");

        var options = new MqttServerOptionsBuilder()
            .WithDefaultEndpoint()
            .WithDefaultEndpointBoundIPAddress(settings.Host)
            .WithDefaultEndpointPort(settings.Port)
            .Build();

        var factory = new MqttServerFactory();
        _mqttServer = factory.CreateMqttServer(options);

        _mqttServer.ValidatingConnectionAsync += context =>
        {
            if (!settings.RequiresAuthentication)
            {
                return Task.CompletedTask;
            }

            if (context.UserName == settings.Username && context.Password == settings.Password)
            {
                return Task.CompletedTask;
            }

            context.ReasonCode = MqttConnectReasonCode.BadUserNameOrPassword;
            _logger.LogWarning(
                "[MQTT Broker] Rejected client {ClientId} from {Endpoint}. Bad credentials.",
                context.ClientId,
                context.RemoteEndPoint);
            return Task.CompletedTask;
        };

        _mqttServer.ClientConnectedAsync += context =>
        {
            _logger.LogInformation(
                "[MQTT Broker] Client connected. ClientId={ClientId} Endpoint={Endpoint}",
                context.ClientId,
                context.RemoteEndPoint);
            return Task.CompletedTask;
        };

        _mqttServer.ClientDisconnectedAsync += context =>
        {
            _logger.LogInformation(
                "[MQTT Broker] Client disconnected. ClientId={ClientId} Type={DisconnectType}",
                context.ClientId,
                context.DisconnectType);
            return Task.CompletedTask;
        };

        try
        {
            await _mqttServer.StartAsync();
        }
        catch (Exception ex)
        {
            _logger.LogCritical(
                ex,
                "[MQTT Broker] Failed to start on {Host}:{Port}. Check whether port {Port} is already used or blocked.",
                settings.HostText,
                settings.Port,
                settings.Port);
            throw;
        }

        _logger.LogInformation(
            "[MQTT Broker] Started on {Host}:{Port}. Auth={AuthMode}",
            settings.HostText,
            settings.Port,
            settings.RequiresAuthentication ? "Enabled" : "Disabled");

        try
        {
            await Task.Delay(Timeout.InfiniteTimeSpan, stoppingToken);
        }
        catch (OperationCanceledException)
        {
            // Service shutdown.
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        if (_mqttServer is not null)
        {
            await _mqttServer.StopAsync();
            _mqttServer.Dispose();
            _logger.LogInformation("[MQTT Broker] Stopped.");
        }

        await base.StopAsync(cancellationToken);
    }

    private sealed record BrokerSettings(
        string HostText,
        System.Net.IPAddress Host,
        int Port,
        string? Username,
        string? Password)
    {
        public bool RequiresAuthentication => !string.IsNullOrWhiteSpace(Username);

        public static BrokerSettings Load()
        {
            var values = ReadIni(SettingsPath);
            var hostText = Read(values, "Broker", "Host") ?? DefaultHost;
            var host = ParseHost(hostText);
            var port = int.TryParse(Read(values, "Broker", "Port"), out var parsedPort) && parsedPort > 0
                ? parsedPort
                : DefaultPort;
            var username = NullIfWhiteSpace(Read(values, "Broker", "Username"));
            var password = Read(values, "Broker", "Password") ?? string.Empty;

            return new BrokerSettings(hostText, host, port, username, password);
        }

        public static string SettingsPath => Path.Combine(AppContext.BaseDirectory, "Settings.ini");

        private static System.Net.IPAddress ParseHost(string value)
        {
            if (value.Equals("localhost", StringComparison.OrdinalIgnoreCase))
            {
                return System.Net.IPAddress.Loopback;
            }

            return System.Net.IPAddress.TryParse(value, out var address)
                ? address
                : System.Net.IPAddress.Any;
        }

        private static string? NullIfWhiteSpace(string? value)
        {
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }

        private static string? Read(Dictionary<string, Dictionary<string, string>> values, string section, string key)
        {
            return values.TryGetValue(section, out var sectionValues) &&
                   sectionValues.TryGetValue(key, out var value)
                ? value
                : null;
        }

        private static Dictionary<string, Dictionary<string, string>> ReadIni(string path)
        {
            var result = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
            var section = string.Empty;

            if (!File.Exists(path))
            {
                return result;
            }

            foreach (var rawLine in File.ReadLines(path))
            {
                var line = rawLine.Trim();
                if (line.Length == 0 || line.StartsWith(';') || line.StartsWith('#'))
                {
                    continue;
                }

                if (line.StartsWith('[') && line.EndsWith(']'))
                {
                    section = line[1..^1].Trim();
                    if (!result.ContainsKey(section))
                    {
                        result[section] = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    }

                    continue;
                }

                var separatorIndex = line.IndexOf('=');
                if (separatorIndex <= 0)
                {
                    continue;
                }

                if (!result.ContainsKey(section))
                {
                    result[section] = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                }

                var key = line[..separatorIndex].Trim();
                var value = line[(separatorIndex + 1)..].Trim();
                result[section][key] = value;
            }

            return result;
        }
    }
}
