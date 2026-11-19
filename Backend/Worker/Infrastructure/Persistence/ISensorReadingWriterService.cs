using Worker.Domain.Models;

namespace Worker.Infrastructure.Persistence;

public interface ISensorReadingWriterService
{
    Task WaitUntilReadyAsync(CancellationToken cancellationToken = default);

    Task<long> InsertAsync(UtilitySensorReading reading, CancellationToken cancellationToken = default);
}
