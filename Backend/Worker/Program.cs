using Worker.Application.Handlers;
using Worker.Infrastructure.Http;
using Worker.Infrastructure.Logging;
using Worker.Infrastructure.Mqtt;
using Worker.Infrastructure.Persistence;
using Worker.Infrastructure.Redis;

var builder = Host.CreateApplicationBuilder(args);
var logDirectory = Path.Combine(AppContext.BaseDirectory, "logs");

builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "Worker";
});

builder.Logging.AddProvider(new FileLoggerProvider(logDirectory));

builder.Services.AddSingleton<MqttTopicConfigService>();
builder.Services.AddSingleton<ILogWriterService, LogWriterService>();
builder.Services.AddSingleton<ISensorReadingWriterService, SensorReadingWriterService>();
builder.Services.AddSingleton<IPowerTelemetryWriterService, PowerTelemetryWriterService>();
builder.Services.AddSingleton<ISyncStatusWriterService, SyncStatusWriterService>();
builder.Services.AddSingleton<IMainServerUploader, MainServerUploader>();
builder.Services.AddSingleton<IShmsSensorHandler, ShmsSensorHandler>();
builder.Services.AddSingleton<IRedisMqttMessageBuffer, RedisMqttMessageBuffer>();
builder.Services.AddSingleton<IMqttMessageHandler, MqttMessageRouter>();
builder.Services.AddSingleton<MqttClientService>();
builder.Services.AddSingleton<IMqttClientService>(serviceProvider => serviceProvider.GetRequiredService<MqttClientService>());
builder.Services.AddSingleton<IMqttPublisher>(serviceProvider => serviceProvider.GetRequiredService<MqttClientService>());
builder.Services.AddHostedService(serviceProvider => serviceProvider.GetRequiredService<MqttClientService>());

var host = builder.Build();
host.Services.GetRequiredService<ILoggerFactory>()
    .CreateLogger("Worker.Startup")
    .LogInformation("SHMS Worker starting. LogDirectory={LogDirectory}", logDirectory);

host.Run();
