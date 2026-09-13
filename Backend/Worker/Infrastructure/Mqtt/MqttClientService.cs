using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Exceptions;
using MQTTnet.Protocol;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Worker.Application.Handlers;
using Worker.Configuration;

namespace Worker.Infrastructure.Mqtt;

public sealed class MqttClientService : BackgroundService, IMqttClientService, IMqttPublisher
{
	private const string DefaultBrokerAddress = "broker.emqx.io";

	private const string DefaultClientId = "Worker";

	private const string DefaultTopic = "utility/power/+/telemetry";

	private const int DefaultPort = 1883;

	private readonly ILogger<MqttClientService> _logger;

	private readonly IMqttMessageHandler _messageHandler;

	private readonly MqttTopicConfigService _topicConfigService;

	private readonly IMqttClient _mqttClient;

	private readonly SemaphoreSlim _connectLock = new SemaphoreSlim(1, 1);

	private readonly IReadOnlyList<MqttSubscriptionTopic> _fallbackTopics;

	private readonly string _clientId;

	private readonly string? _username;

	private readonly string? _password;

	private readonly int _qos;

	private readonly TimeSpan _retryDelay;

	private readonly TimeSpan _loopInterval;

	private MqttClientOptions? _mqttClientOptions;

	private string _brokerAddress;

	private int _port;

	private IReadOnlyList<string> _subscribedTopics = Array.Empty<string>();

	private string _subscribedTopicSignature = string.Empty;

	private CancellationToken _stoppingToken;

	private int _reconnectScheduled;

	public MqttClientService(ILogger<MqttClientService> logger, IMqttMessageHandler messageHandler, MqttTopicConfigService topicConfigService)
	{
		_logger = logger;
		_messageHandler = messageHandler;
		_topicConfigService = topicConfigService;
		Config instance = Config.Instance;
		_brokerAddress = ReadSetting(instance, "MQTT", "Host", "MQTT__Host", "MQTT_HOST") ?? DefaultBrokerAddress;
		_port = ReadIntSetting(instance, "MQTT", "Port", 1883, "MQTT__Port", "MQTT_PORT");
		_clientId = ReadSetting(instance, "MQTT", "ClientId", "MQTT__ClientId", "MQTT_CLIENT_ID") ?? "Worker";
		_username = ReadSetting(instance, "MQTT", "Username", "MQTT__Username", "MQTT_USERNAME");
		_password = ReadSetting(instance, "MQTT", "Password", "MQTT__Password", "MQTT_PASSWORD");
		_qos = ReadIntSetting(instance, "MQTT", "Qos", 2, "MQTT__Qos", "MQTT_QOS");
		_retryDelay = TimeSpan.FromSeconds(Math.Max(1, ReadIntSetting(instance, "Worker", "ReconnectDelaySeconds", 3, "Worker__ReconnectDelaySeconds", "WORKER_RECONNECT_DELAY_SECONDS")));
		_loopInterval = TimeSpan.FromSeconds(Math.Max(1, ReadIntSetting(instance, "Worker", "IntervalSeconds", 1, "Worker__IntervalSeconds", "WORKER_INTERVAL_SECONDS")));
		_fallbackTopics = ReadTopics(instance, _qos);
		MqttFactory mqttFactory = new MqttFactory();
		_mqttClient = mqttFactory.CreateMqttClient();
		_mqttClient.ApplicationMessageReceivedAsync += OnApplicationMessageReceivedAsync;
		_mqttClient.ConnectedAsync += OnConnectedAsync;
		_mqttClient.DisconnectedAsync += OnDisconnectedAsync;
	}

	public void Configure(string brokerHost, int brokerPort)
	{
		string text = (string.IsNullOrWhiteSpace(brokerHost) ? DefaultBrokerAddress : brokerHost);
		int num = ((brokerPort > 0) ? brokerPort : 1883);
		string text2 = (string.IsNullOrWhiteSpace(_clientId) ? $"{"Worker"}-{Environment.MachineName}-{Guid.NewGuid():N}" : _clientId);
		MqttClientOptionsBuilder mqttClientOptionsBuilder = new MqttClientOptionsBuilder().WithClientId(text2).WithTcpServer(text, num).WithKeepAlivePeriod(TimeSpan.FromSeconds(30.0))
			.WithTimeout(TimeSpan.FromSeconds(10.0));
		if (!string.IsNullOrWhiteSpace(_username))
		{
			mqttClientOptionsBuilder.WithCredentials(_username, _password ?? string.Empty);
		}
		_mqttClientOptions = mqttClientOptionsBuilder.Build();
		_logger.LogInformation("[MQTT] Config: Host={Host} Port={Port} ClientId={ClientId}", text, num, text2);
	}

	public async Task ConnectAsync(CancellationToken cancellationToken = default(CancellationToken))
	{
		if (_mqttClientOptions == null)
		{
			throw new InvalidOperationException("MQTT client options are not configured.");
		}
		await _connectLock.WaitAsync(cancellationToken);
		try
		{
			if (!_mqttClient.IsConnected)
			{
				_logger.LogInformation("[MQTT] Connecting...");
				await _mqttClient.ConnectAsync(_mqttClientOptions, cancellationToken);
				if (_mqttClient.IsConnected)
				{
					_logger.LogInformation("[MQTT] Connected OK.");
				}
				else
				{
					_logger.LogWarning("[MQTT] Connect finished but client is still disconnected.");
				}
			}
		}
		catch (MqttCommunicationException ex)
		{
			MqttCommunicationException ex2 = ex;
			_logger.LogError(ex2, "[MQTT] Communication error.");
		}
		catch (SocketException ex3)
		{
			SocketException ex4 = ex3;
			_logger.LogError(ex4, "[MQTT] Socket error.");
		}
		catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
		{
		}
		catch (Exception ex6)
		{
			Exception ex7 = ex6;
			_logger.LogError(ex7, "[MQTT] Connect exception.");
		}
		finally
		{
			_connectLock.Release();
		}
	}

	public async Task SubscribeAsync(string topic, CancellationToken cancellationToken = default(CancellationToken))
	{
		if (!_mqttClient.IsConnected)
		{
			throw new InvalidOperationException("MQTT client is not connected.");
		}
		MqttClientSubscribeOptions options = new MqttClientSubscribeOptionsBuilder().WithTopicFilter(delegate(MqttTopicFilterBuilder filter)
		{
			filter.WithTopic(topic).WithQualityOfServiceLevel(ToQualityOfServiceLevel(_qos));
		}).Build();
		await _mqttClient.SubscribeAsync(options, cancellationToken);
		_logger.LogInformation("[MQTT] Subscribed: {Topic}", topic);
	}

	public async Task PublishAsync(string topic, string payload, bool retain = false, int qos = 0, CancellationToken cancellationToken = default(CancellationToken))
	{
		if (!_mqttClient.IsConnected)
		{
			throw new InvalidOperationException("MQTT client is not connected.");
		}
		MqttApplicationMessage message = new MqttApplicationMessageBuilder().WithTopic(topic).WithPayload(payload ?? string.Empty).WithRetainFlag(retain)
			.WithQualityOfServiceLevel(ToQualityOfServiceLevel(qos))
			.Build();
		await _mqttClient.PublishAsync(message, cancellationToken);
	}

	protected override async Task ExecuteAsync(CancellationToken stoppingToken)
	{
		_stoppingToken = stoppingToken;
		if (string.IsNullOrWhiteSpace(_brokerAddress))
		{
			_brokerAddress = DefaultBrokerAddress;
		}
		if (_port <= 0)
		{
			_port = 1883;
		}
		Configure(_brokerAddress, _port);
		while (!stoppingToken.IsCancellationRequested)
		{
			try
			{
				if (!_mqttClient.IsConnected)
				{
					await ConnectAsync(stoppingToken);
					if (!_mqttClient.IsConnected)
					{
						await _messageHandler.ReprocessBufferAsync(stoppingToken);
						await Task.Delay(_retryDelay, stoppingToken);
						continue;
					}
				}
				await SubscribeConfiguredTopicsAsync(stoppingToken);
				await _messageHandler.ReprocessBufferAsync(stoppingToken);
			}
			catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
			{
				break;
			}
			catch (Exception exception)
			{
				_logger.LogWarning(exception, "[MQTT] Loop error, retry.");
				await Task.Delay(_retryDelay, stoppingToken);
			}
			await Task.Delay(_loopInterval, stoppingToken);
		}
	}

	private Task OnConnectedAsync(MqttClientConnectedEventArgs e)
	{
		_logger.LogInformation("[MQTT] Connected. ResultCode={ResultCode}", e.ConnectResult?.ResultCode);
		_subscribedTopics = Array.Empty<string>();
		_subscribedTopicSignature = string.Empty;
		return Task.CompletedTask;
	}

	private Task OnDisconnectedAsync(MqttClientDisconnectedEventArgs e)
	{
		_logger.LogWarning("[MQTT] Disconnected. Reason={Reason} ReasonString={ReasonString} Ex={Exception}", e.Reason, e.ReasonString, e.Exception?.Message);
		_subscribedTopics = Array.Empty<string>();
		_subscribedTopicSignature = string.Empty;
		_ = ReconnectUntilConnectedAsync(_stoppingToken);
		return Task.CompletedTask;
	}

	private async Task ReconnectUntilConnectedAsync(CancellationToken cancellationToken)
	{
		if (_mqttClientOptions == null || cancellationToken.IsCancellationRequested)
		{
			return;
		}

		if (Interlocked.Exchange(ref _reconnectScheduled, 1) == 1)
		{
			return;
		}

		try
		{
			await Task.Delay(_retryDelay, cancellationToken);

			while (!cancellationToken.IsCancellationRequested && !_mqttClient.IsConnected)
			{
				_logger.LogInformation("[MQTT] Auto reconnect attempt...");
				await ConnectAsync(cancellationToken);

				if (_mqttClient.IsConnected)
				{
					await SubscribeConfiguredTopicsAsync(cancellationToken);
					await _messageHandler.ReprocessBufferAsync(cancellationToken);
					return;
				}

				await Task.Delay(_retryDelay, cancellationToken);
			}
		}
		catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
		{
		}
		catch (Exception exception)
		{
			_logger.LogWarning(exception, "[MQTT] Auto reconnect failed.");
		}
		finally
		{
			Interlocked.Exchange(ref _reconnectScheduled, 0);
		}
	}

	private async Task OnApplicationMessageReceivedAsync(MqttApplicationMessageReceivedEventArgs e)
	{
		string topic = e.ApplicationMessage?.Topic ?? string.Empty;
		string payloadText = GetPayloadText(e.ApplicationMessage);
		try
		{
			await _messageHandler.HandleAsync(topic, payloadText, CancellationToken.None);
		}
		catch (Exception exception)
		{
			_logger.LogError(exception, "[MQTT] Failed to save message to SHMS storage. Topic={Topic}", topic);
		}
	}

	private async Task SubscribeConfiguredTopicsAsync(CancellationToken cancellationToken)
	{
		if (!_mqttClient.IsConnected)
		{
			return;
		}
		try
		{
			IReadOnlyList<MqttSubscriptionTopic> topics = await _topicConfigService.GetActiveTopicsAsync(cancellationToken);
			if (topics.Count == 0)
			{
				topics = _fallbackTopics;
			}
			string signature = string.Join("|", topics.Select((MqttSubscriptionTopic mqttSubscriptionTopic) => $"{mqttSubscriptionTopic.Topic}:{mqttSubscriptionTopic.Qos}"));
			if (string.Equals(_subscribedTopicSignature, signature, StringComparison.Ordinal))
			{
				return;
			}
			if (!string.IsNullOrWhiteSpace(_subscribedTopicSignature))
			{
				MqttClientUnsubscribeOptionsBuilder unsubscribeBuilder = new MqttClientUnsubscribeOptionsBuilder();
				foreach (string topic in _subscribedTopics)
				{
					unsubscribeBuilder.WithTopicFilter(topic);
				}
				await _mqttClient.UnsubscribeAsync(unsubscribeBuilder.Build(), cancellationToken);
			}
			MqttClientSubscribeOptionsBuilder builder = new MqttClientSubscribeOptionsBuilder();
			foreach (MqttSubscriptionTopic topic2 in topics)
			{
				builder.WithTopicFilter(delegate(MqttTopicFilterBuilder filter)
				{
					filter.WithTopic(topic2.Topic).WithQualityOfServiceLevel(ToQualityOfServiceLevel(topic2.Qos));
				});
			}
			await _mqttClient.SubscribeAsync(builder.Build(), cancellationToken);
			_subscribedTopics = topics.Select((MqttSubscriptionTopic mqttSubscriptionTopic) => mqttSubscriptionTopic.Topic).ToList();
			_subscribedTopicSignature = signature;
			_logger.LogInformation("[MQTT] Subscribed topics: {Topics}", string.Join(", ", topics.Select((MqttSubscriptionTopic mqttSubscriptionTopic) => $"{mqttSubscriptionTopic.Topic} (QoS {mqttSubscriptionTopic.Qos})")));
		}
		catch (Exception exception)
		{
			_subscribedTopicSignature = string.Empty;
			_logger.LogWarning(exception, "[MQTT] Subscribe failed, retrying.");
		}
	}

	private static string GetPayloadText(MqttApplicationMessage? message)
	{
		if (message == null)
		{
			return string.Empty;
		}
		ArraySegment<byte> payloadSegment = message.PayloadSegment;
		if (payloadSegment.Array == null || payloadSegment.Count == 0)
		{
			return string.Empty;
		}
		return Encoding.UTF8.GetString(payloadSegment.Array, payloadSegment.Offset, payloadSegment.Count);
	}

	private static IReadOnlyList<MqttSubscriptionTopic> ReadTopics(Config cfg, int qos)
	{
		IReadOnlyList<string> readOnlyList = cfg.ReadList("Topics", "MQTT");
		if (readOnlyList.Count == 0)
		{
			string item = ReadSetting(cfg, "MQTT", "Topic", "MQTT__Topic", "MQTT_TOPIC") ?? "utility/power/+/telemetry";
			readOnlyList = new[] { item };
		}
		return (from topic in readOnlyList
			where !string.IsNullOrWhiteSpace(topic)
			select new MqttSubscriptionTopic(topic.Trim(), qos)).ToList();
	}

	private static string? ReadSetting(Config cfg, string section, string key, params string[] environmentKeys)
	{
		foreach (string variable in environmentKeys)
		{
			string? environmentVariable = Environment.GetEnvironmentVariable(variable);
			if (!string.IsNullOrWhiteSpace(environmentVariable))
			{
				return environmentVariable.Trim();
			}
		}
		return cfg.Read(key, section);
	}

	private static int ReadIntSetting(Config cfg, string section, string key, int defaultValue, params string[] environmentKeys)
	{
		string? s = ReadSetting(cfg, section, key, environmentKeys);
		return int.TryParse(s, out var result) ? result : cfg.ReadInt(key, section, defaultValue);
	}

	private static MqttQualityOfServiceLevel ToQualityOfServiceLevel(int qos)
	{
		return qos switch
		{
			1 => MqttQualityOfServiceLevel.AtLeastOnce, 
			2 => MqttQualityOfServiceLevel.ExactlyOnce, 
			_ => MqttQualityOfServiceLevel.AtMostOnce, 
		};
	}
}
