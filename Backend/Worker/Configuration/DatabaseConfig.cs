namespace Worker.Configuration;

public static class DatabaseConfig
{
	private const string DefaultConnectionString = "Server=127.0.0.1;Port=3306;User ID=root;Password=root_native;Database=utility-system;SslMode=None;AllowPublicKeyRetrieval=True;";

	public static string MysqlConnString =>
		ReadEnvironment("MYSQL_CONNECTION_STRING")
		?? ReadEnvironment("ConnectionStrings__DefaultConnection")
		?? Config.Instance.Read("ConnectionString", "Database")
		?? DefaultConnectionString;

	private static string? ReadEnvironment(string key)
	{
		var value = Environment.GetEnvironmentVariable(key);
		return string.IsNullOrWhiteSpace(value) ? null : value;
	}
}
