namespace Web.API.Persistence.Services.AuthService;

public class JwtSettings
{
    public string Issuer { get; set; } = "UtilitySystem";
    public string Audience { get; set; } = "UtilitySystem.Frontend";
    public string SigningKey { get; set; } = "UtilitySystem-Development-Jwt-Signing-Key-2026-Change-Me";
    public int ExpiresHours { get; set; } = 8;
}
