using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Web.API.Domain.Production;
using Web.API.Persistence.Context;
using Web.API.Persistence.Services.Production;
using Web.API.Persistence.Licensing;

namespace Web.API.Controllers;

[ApiController]
[Route("api/utilities/{kind}")]
public class UtilityController(AppDbContext db) : ApiControllerBase
{
    [HttpGet("devices")]
    public async Task<IActionResult> Devices(string kind, CancellationToken ct)
    {
        if (!UtilityTelemetryStore.ValidKind(kind)) return ApiNotFound("Unknown utility type.");
        try {
            await UtilityTelemetryStore.EnsureSchemaAsync(db, ct);
            var rows = await db.UtilityDevices.AsNoTracking().Where(x => x.Kind == kind)
                .OrderBy(x => x.DeviceCode).Select(x => new { Device = x, Latest = x.Readings.OrderByDescending(r => r.Timestamp).FirstOrDefault() }).ToListAsync(ct);
            return ApiOk(rows.Select(x => UtilityTelemetryStore.DeviceDto(x.Device, x.Latest)));
        } catch (Exception ex) { return ApiBadRequest(ex); }
    }

    [HttpPost("devices")]
    public Task<IActionResult> Create(string kind, UtilityDeviceRequest request, CancellationToken ct) => Save(kind, null, request, ct);
    [HttpPut("devices/{id:long}")]
    public Task<IActionResult> Update(string kind, long id, UtilityDeviceRequest request, CancellationToken ct) => Save(kind, id, request, ct);

    private async Task<IActionResult> Save(string kind, long? id, UtilityDeviceRequest request, CancellationToken ct)
    {
        if (!UtilityTelemetryStore.ValidKind(kind)) return ApiNotFound("Unknown utility type.");
        try {
            await UtilityTelemetryStore.EnsureSchemaAsync(db, ct);
            await using var license = id == null ? await DeviceLicense.AcquireAsync(db.Database.GetConnectionString()!, ct) : null;
            var device = id == null ? new UtilityDevice { Kind = kind } : await db.UtilityDevices.FirstOrDefaultAsync(x => x.Id == id && x.Kind == kind, ct);
            if (device == null) return ApiNotFound("Meter not found.");
            var code = request.DeviceCode.Trim().ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(request.Name)) throw new InvalidOperationException("Name is required.");
            if (await db.UtilityDevices.AnyAsync(x => x.Kind == kind && x.DeviceCode == code && x.Id != (id ?? 0), ct))
                throw new InvalidOperationException("Device code already exists.");
            device.DeviceCode = code; device.Name = request.Name.Trim(); device.Location = (request.Location ?? "").Trim();
            device.Enabled = request.Enabled; device.LowPressureBar = request.LowPressureBar; device.HighFlowRate = request.HighFlowRate;
            if (id == null) { await license!.EnsureCanAddAsync(ct); db.UtilityDevices.Add(device); }
            await db.SaveChangesAsync(ct);
            var result = UtilityTelemetryStore.DeviceDto(device, await db.UtilityReadings.AsNoTracking().Where(x => x.DeviceId == device.Id).OrderByDescending(x => x.Timestamp).FirstOrDefaultAsync(ct));
            return id == null ? ApiCreated(result, "Meter created") : ApiOk(result, "Meter updated");
        } catch (Exception ex) { return ApiBadRequest(ex); }
    }

    [HttpDelete("devices/{id:long}")]
    public async Task<IActionResult> Delete(string kind, long id, CancellationToken ct)
    {
        if (!UtilityTelemetryStore.ValidKind(kind)) return ApiNotFound("Unknown utility type.");
        try {
            await UtilityTelemetryStore.EnsureSchemaAsync(db, ct);
            var device = await db.UtilityDevices.FirstOrDefaultAsync(x => x.Id == id && x.Kind == kind, ct);
            if (device == null) return ApiNotFound("Meter not found.");
            db.Remove(device); await db.SaveChangesAsync(ct);
            return ApiOk(new { id }, "Meter and readings deleted");
        } catch (Exception ex) { return ApiBadRequest(ex); }
    }

    [HttpPost("devices/{id:long}/telemetry")]
    public async Task<IActionResult> Record(string kind, long id, UtilityReadingRequest request, CancellationToken ct)
    {
        if (!UtilityTelemetryStore.ValidKind(kind)) return ApiNotFound("Unknown utility type.");
        try {
            await UtilityTelemetryStore.EnsureSchemaAsync(db, ct);
            var device = await db.UtilityDevices.FirstOrDefaultAsync(x => x.Id == id && x.Kind == kind, ct);
            if (device == null) return ApiNotFound("Meter not found.");
            var inserted = await UtilityTelemetryStore.RecordAsync(db, device, request, ct);
            return ApiOk(new { inserted }, inserted ? "Telemetry stored" : "Duplicate telemetry ignored");
        } catch (Exception ex) { return ApiBadRequest(ex); }
    }

    [HttpGet("devices/{id:long}/history")]
    public async Task<IActionResult> History(string kind, long id, DateTimeOffset? start, DateTimeOffset? end, CancellationToken ct)
    {
        if (!UtilityTelemetryStore.ValidKind(kind)) return ApiNotFound("Unknown utility type.");
        try {
            await UtilityTelemetryStore.EnsureSchemaAsync(db, ct);
            if (!await db.UtilityDevices.AnyAsync(x => x.Id == id && x.Kind == kind, ct)) return ApiNotFound("Meter not found.");
            var to = (end ?? DateTimeOffset.UtcNow).UtcDateTime;
            var from = (start ?? new DateTimeOffset(to.AddHours(-24), TimeSpan.Zero)).UtcDateTime;
            if (from >= to || to - from > TimeSpan.FromDays(31)) throw new InvalidOperationException("Select a range between 0 and 31 days.");
            var rows = await db.UtilityReadings.AsNoTracking().Where(x => x.DeviceId == id && x.Timestamp >= from && x.Timestamp <= to)
                .OrderByDescending(x => x.Timestamp).Take(2001).ToListAsync(ct);
            var truncated = rows.Count > 2000;
            return ApiOk(new { truncated, readings = rows.Take(2000).Reverse().Select(UtilityTelemetryStore.ReadingDto) });
        } catch (Exception ex) { return ApiBadRequest(ex); }
    }
}
