using System.Security.Cryptography;
using System.Text;
using MySqlConnector;

namespace Web.API.Persistence.Licensing;

public sealed record LicenseStatus(string InstallationId, int UsedDevices, int MaxDevices, bool Active, bool VerificationConfigured);

// All device-creation paths must hold this database-scoped advisory lock until committed.
public sealed class DeviceLicense : IAsyncDisposable
{
    private readonly MySqlConnection connection;
    private readonly string lockName;
    private DeviceLicense(MySqlConnection connection, string lockName) { this.connection = connection; this.lockName = lockName; }

    public static async Task<DeviceLicense> AcquireAsync(string connectionString, CancellationToken ct)
    {
        var connection = new MySqlConnection(connectionString);
        try
        {
            await connection.OpenAsync(ct);
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(connection.Database))).Substring(0, 32);
            var instance = new DeviceLicense(connection, "utility-license-" + hash);
            var locked = await instance.ScalarAsync("SELECT GET_LOCK(@name, 15)", ct, ("@name", instance.lockName));
            if (Convert.ToInt32(locked) != 1) throw new InvalidOperationException("Could not acquire device license lock.");
            await instance.ExecuteAsync("CREATE TABLE IF NOT EXISTS device_license (id INT NOT NULL PRIMARY KEY, installation_id CHAR(36) NOT NULL, token TEXT NULL) ENGINE=InnoDB", ct);
            await instance.ExecuteAsync("INSERT IGNORE INTO device_license (id, installation_id) VALUES (1, UUID())", ct);
            return instance;
        }
        catch { await connection.DisposeAsync(); throw; }
    }

    public async Task<LicenseStatus> StatusAsync(CancellationToken ct)
    {
        var id = Convert.ToString(await ScalarAsync("SELECT installation_id FROM device_license WHERE id=1", ct))!;
        var raw = await ScalarAsync("SELECT token FROM device_license WHERE id=1", ct);
        var token = raw is DBNull or null ? null : Convert.ToString(raw);
        var used = await CountDevicesAsync(ct);
        var configured = File.Exists(PublicKeyPath());
        var capacity = 0;
        var active = false;
        if (!string.IsNullOrWhiteSpace(token))
        {
            try { capacity = LicenseToken.Verify(token, ReadPublicKey(), Guid.Parse(id)).MaxDevices; active = true; }
            catch (Exception ex) when (ex is InvalidOperationException or IOException or UnauthorizedAccessException) { }
        }
        return new LicenseStatus(id, used, capacity, active, configured);
    }

    public async Task ActivateAsync(string token, CancellationToken ct)
    {
        var status = await StatusAsync(ct);
        var claims = LicenseToken.Verify(token, ReadPublicKey(), Guid.Parse(status.InstallationId));
        if (claims.MaxDevices < status.UsedDevices) throw new InvalidOperationException("License capacity is below the number of registered devices.");
        if (status.Active && claims.MaxDevices < status.MaxDevices) throw new InvalidOperationException("A license cannot reduce the current capacity.");
        await ExecuteAsync("UPDATE device_license SET token=@token WHERE id=1", ct, ("@token", token.Trim()));
    }

    public async Task EnsureCanAddAsync(CancellationToken ct)
    {
        var status = await StatusAsync(ct);
        if (!status.Active) throw new InvalidOperationException("No valid device license. Activate a token in Settings.");
        if (status.UsedDevices >= status.MaxDevices) throw new InvalidOperationException($"Device limit reached ({status.UsedDevices}/{status.MaxDevices}). Activate a higher-capacity token in Settings.");
    }

    private static string ReadPublicKey()
    {
        var path = PublicKeyPath();
        if (!File.Exists(path)) throw new InvalidOperationException("License verification key is not configured on the server.");
        return File.ReadAllText(path);
    }

    private static string PublicKeyPath() => Environment.GetEnvironmentVariable("LICENSE_PUBLIC_KEY_PATH") is { Length: > 0 } path
        ? path
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".utility-monitoring-license", "issuer-public.pem");

    private async Task<int> CountDevicesAsync(CancellationToken ct)
    {
        var count = 0;
        foreach (var table in new[] { "power_devices", "utility_devices", "sensor_devices" })
        {
            var exists = Convert.ToInt32(await ScalarAsync("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=@table", ct, ("@table", table)));
            if (exists != 0) count += Convert.ToInt32(await ScalarAsync($"SELECT COUNT(*) FROM `{table}`", ct));
        }
        return count;
    }

    private async Task<object?> ScalarAsync(string sql, CancellationToken ct, params (string, object)[] parameters)
    {
        await using var command = new MySqlCommand(sql, connection);
        foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value);
        return await command.ExecuteScalarAsync(ct);
    }
    private async Task ExecuteAsync(string sql, CancellationToken ct, params (string, object)[] parameters)
    {
        await using var command = new MySqlCommand(sql, connection);
        foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value);
        await command.ExecuteNonQueryAsync(ct);
    }
    public async ValueTask DisposeAsync()
    {
        try { await ScalarAsync("SELECT RELEASE_LOCK(@name)", CancellationToken.None, ("@name", lockName)); }
        finally { await connection.DisposeAsync(); }
    }
}
