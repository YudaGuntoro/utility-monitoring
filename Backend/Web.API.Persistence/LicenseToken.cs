using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Web.API.Persistence.Licensing;

public sealed record LicenseClaims(
    [property: JsonPropertyName("version")] int Version,
    [property: JsonPropertyName("installation_id")] Guid InstallationId,
    [property: JsonPropertyName("max_devices")] int MaxDevices,
    [property: JsonPropertyName("license_id")] Guid LicenseId,
    [property: JsonPropertyName("issued_at")] long IssuedAt);

public static class LicenseToken
{
    public static LicenseClaims Verify(string token, string publicKeyPem, Guid installationId)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 8192)
            throw new InvalidOperationException("Invalid license token.");
        var parts = token.Trim().Split('.');
        if (parts.Length != 2) throw new InvalidOperationException("Invalid license token format.");
        try
        {
            using var rsa = RSA.Create();
            rsa.ImportFromPem(publicKeyPem);
            if (!rsa.VerifyData(Encoding.ASCII.GetBytes(parts[0]), Decode(parts[1]), HashAlgorithmName.SHA256, RSASignaturePadding.Pss))
                throw new InvalidOperationException("License signature is invalid.");
            var claims = JsonSerializer.Deserialize<LicenseClaims>(Decode(parts[0]));
            if (claims is null || claims.Version != 1 || claims.LicenseId == Guid.Empty || claims.MaxDevices <= 0 || claims.IssuedAt <= 0)
                throw new InvalidOperationException("License contents are invalid.");
            if (claims.InstallationId != installationId)
                throw new InvalidOperationException("License is for a different installation.");
            return claims;
        }
        catch (Exception ex) when (ex is FormatException or JsonException or CryptographicException or ArgumentException)
        {
            throw new InvalidOperationException("Invalid license token or verification key.", ex);
        }
    }

    private static byte[] Decode(string value)
    {
        if (value.Any(c => !(char.IsAsciiLetterOrDigit(c) || c is '-' or '_')))
            throw new FormatException("Invalid base64url.");
        var base64 = value.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(base64.PadRight((base64.Length + 3) / 4 * 4, '='));
    }
}
