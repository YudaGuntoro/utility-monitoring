using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

// Run this tool only in the vendor's trusted environment. Never ship its private key.
try
{
    if (args.Length == 3 && args[0] == "generate-keys")
    {
        var privatePath = Path.GetFullPath(args[1]);
        var publicPath = Path.GetFullPath(args[2]);
        if (File.Exists(privatePath) || File.Exists(publicPath))
            throw new InvalidOperationException("Key files must not already exist.");
        using var rsa = RSA.Create(3072);
        using (var file = new FileStream(privatePath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        using (var writer = new StreamWriter(file))
            writer.Write(rsa.ExportPkcs8PrivateKeyPem());
        using (var file = new FileStream(publicPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        using (var writer = new StreamWriter(file))
            writer.Write(rsa.ExportSubjectPublicKeyInfoPem());
        Console.WriteLine("Keys generated. Keep the private key confidential and back it up securely.");
        return 0;
    }

    if (args.Length == 4 && args[0] == "issue")
    {
        if (!Guid.TryParse(args[2], out var installationId))
            throw new ArgumentException("Installation ID must be a GUID.");
        if (!int.TryParse(args[3], out var maxDevices) || maxDevices <= 0)
            throw new ArgumentException("Device capacity must be a positive integer.");
        using var rsa = RSA.Create();
        rsa.ImportFromPem(File.ReadAllText(args[1]));
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            version = 1,
            installation_id = installationId.ToString("D"),
            max_devices = maxDevices,
            license_id = Guid.NewGuid().ToString("D"),
            issued_at = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
        });
        var encoded = Encode(payload);
        var signature = rsa.SignData(Encoding.ASCII.GetBytes(encoded), HashAlgorithmName.SHA256, RSASignaturePadding.Pss);
        Console.WriteLine($"{encoded}.{Encode(signature)}");
        return 0;
    }

    Console.Error.WriteLine("Usage:\n  LicenseIssuer generate-keys <private-key.pem> <public-key.pem>\n  LicenseIssuer issue <private-key.pem> <installation-id-guid> <max-devices>");
    return 2;
}
catch (Exception ex)
{
    Console.Error.WriteLine(ex.Message);
    return 1;
}

static string Encode(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
