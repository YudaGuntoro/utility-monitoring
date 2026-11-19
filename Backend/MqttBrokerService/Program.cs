using MqttBrokerService;
using MqttBrokerService.Logging;

var builder = Host.CreateApplicationBuilder(args);
var logDirectory = Path.Combine(AppContext.BaseDirectory, "logs");

builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole(options =>
{
    options.SingleLine = true;
    options.TimestampFormat = "yyyy-MM-dd HH:mm:ss ";
});
builder.Logging.AddProvider(new FileLoggerProvider(logDirectory));

AppDomain.CurrentDomain.UnhandledException += (_, eventArgs) =>
{
    File.AppendAllText(
        Path.Combine(logDirectory, $"mqtt-broker-fatal-{DateTime.Now:yyyyMMdd}.log"),
        $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff zzz} [Fatal] Unhandled exception{Environment.NewLine}{eventArgs.ExceptionObject}{Environment.NewLine}");
};

builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "UtilityMqttBroker";
});

builder.Services.AddHostedService<MqttBrokerWorker>();

var host = builder.Build();
host.Run();
