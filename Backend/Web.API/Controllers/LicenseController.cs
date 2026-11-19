using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Web.API.Persistence.Context;
using Web.API.Persistence.Licensing;

namespace Web.API.Controllers;

[ApiController]
[Route("api/license")]
public class LicenseController(AppDbContext db) : ApiControllerBase
{
    public sealed record ActivateRequest(string Token);

    [HttpGet]
    public async Task<IActionResult> Status(CancellationToken ct)
    {
        try
        {
            await using var license = await DeviceLicense.AcquireAsync(db.Database.GetConnectionString()!, ct);
            return ApiOk(await license.StatusAsync(ct));
        }
        catch (Exception ex) { return ApiBadRequest(ex); }
    }

    [HttpPost("activate")]
    [Authorize(Roles = "ADMIN")]
    public async Task<IActionResult> Activate(ActivateRequest request, CancellationToken ct)
    {
        try
        {
            await using var license = await DeviceLicense.AcquireAsync(db.Database.GetConnectionString()!, ct);
            await license.ActivateAsync(request.Token, ct);
            return ApiOk(await license.StatusAsync(ct), "License activated.");
        }
        catch (Exception ex) { return ApiBadRequest(ex); }
    }
}
