namespace Worker.Infrastructure.Persistence;

public interface IPowerTelemetryWriterService
{
    Task WaitUntilReadyAsync(CancellationToken cancellationToken = default);
    Task<bool> UpsertAsync(string topic, string payload, CancellationToken cancellationToken = default);
}
