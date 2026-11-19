using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Web.API.Domain.Production;
using Web.API.Persistence.Context;
using Web.API.Persistence.Services.Production;

namespace Worker.Infrastructure.Persistence;

public sealed class UtilityTelemetryWriter(IDbContextFactory<AppDbContext> factory, ILogger<UtilityTelemetryWriter> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    public async Task<bool> HandleAsync(string topic, string payload, CancellationToken ct)
    {
        var parts = topic.Split('/');
        if (parts.Length < 2 || parts[0] != "utility" || !UtilityTelemetryStore.ValidKind(parts[1])) return false;
        try {
            if (parts.Length != 4 || parts[3] != "telemetry") throw new InvalidOperationException("Invalid utility topic.");
            var request = JsonSerializer.Deserialize<UtilityReadingRequest>(payload, JsonOptions)
                ?? throw new InvalidOperationException("Empty payload.");
            await using var db = await factory.CreateDbContextAsync(ct);
            await UtilityTelemetryStore.EnsureSchemaAsync(db, ct);
            var device = await db.UtilityDevices.SingleOrDefaultAsync(x => x.Kind == parts[1] && x.DeviceCode == parts[2], ct);
            if (device == null) throw new InvalidOperationException("Register the meter before sending telemetry.");
            await UtilityTelemetryStore.RecordAsync(db, device, request, ct);
        } catch (Exception ex) when (ex is JsonException or InvalidOperationException) {
            logger.LogWarning(ex, "Utility telemetry rejected: {Topic}", topic);
        }
        return true;
    }
}
