using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using RestSharp;
using Worker.Configuration;
using Worker.Domain.Models;

namespace Worker.Infrastructure.Http;

public sealed class MainServerUploader : IMainServerUploader, IDisposable
{
    private const string TopicHeaderName = "X-Utility-MQTT-Topic";

    private readonly RestClient? _client;
    private readonly ILogger<MainServerUploader> _logger;
    private readonly string? _uploadUrl;

    public MainServerUploader(ILogger<MainServerUploader> logger)
    {
        _logger = logger;
        _uploadUrl = ReadSetting("UploadUrl", "MainServer", "MAIN_SERVER_UPLOAD_URL");
        var timeoutSeconds = Math.Max(1, ReadIntSetting("TimeoutSeconds", "MainServer", 5, "MAIN_SERVER_TIMEOUT_SECONDS"));
        if (IsConfigured)
        {
            _client = new RestClient(new RestClientOptions(_uploadUrl!)
            {
                Timeout = TimeSpan.FromSeconds(timeoutSeconds)
            });
        }
    }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_uploadUrl);

    public string? UploadUrl => _uploadUrl;

    public async Task<MainServerUploadResult> UploadAsync(string topic, string payload, CancellationToken cancellationToken = default)
    {
        if (!IsConfigured || _client == null)
        {
            return MainServerUploadResult.Failed("Main server upload URL is not configured.");
        }

        try
        {
            var request = new RestRequest(string.Empty, Method.Post)
                .AddHeader(TopicHeaderName, topic)
                .AddStringBody(ToJsonBody(payload), DataFormat.Json);

            var response = await _client.ExecuteAsync(request, cancellationToken);
            if (response.IsSuccessful)
            {
                return MainServerUploadResult.Ok();
            }

            return MainServerUploadResult.Failed(BuildErrorMessage(response));
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or OperationCanceledException or TimeoutException)
        {
            if (ex is OperationCanceledException && cancellationToken.IsCancellationRequested)
            {
                throw;
            }

            _logger.LogWarning(ex, "[MainServer] Upload failed. Topic={Topic}", topic);
            return MainServerUploadResult.Failed(ex.Message);
        }
    }

    public void Dispose()
    {
        _client?.Dispose();
    }

    private static string ToJsonBody(string payload)
    {
        if (string.IsNullOrWhiteSpace(payload))
        {
            return "{}";
        }

        try
        {
            return JsonConvert.SerializeObject(JToken.Parse(payload));
        }
        catch (JsonException)
        {
            return JsonConvert.SerializeObject(payload);
        }
    }

    private static string BuildErrorMessage(RestResponse response)
    {
        var statusCode = response.StatusCode == 0 ? "NoStatusCode" : ((int)response.StatusCode).ToString();
        var responseText = string.IsNullOrWhiteSpace(response.Content) ? response.ErrorMessage : response.Content;
        return $"Main server returned {statusCode}: {responseText ?? response.ResponseStatus.ToString()}";
    }

    private static string? ReadSetting(string key, string section, params string[] environmentKeys)
    {
        foreach (var variable in environmentKeys)
        {
            var value = Environment.GetEnvironmentVariable(variable);
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }

        return Config.Instance.Read(key, section);
    }

    private static int ReadIntSetting(string key, string section, int defaultValue, params string[] environmentKeys)
    {
        var value = ReadSetting(key, section, environmentKeys);
        return int.TryParse(value, out var parsed) ? parsed : Config.Instance.ReadInt(key, section, defaultValue);
    }
}
