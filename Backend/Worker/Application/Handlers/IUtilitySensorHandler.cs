namespace Worker.Application.Handlers;

public interface IUtilitySensorHandler
{
    bool CanHandle(string topic);

    Task InsertAsync(string topic, string payload, CancellationToken cancellationToken = default);
}
