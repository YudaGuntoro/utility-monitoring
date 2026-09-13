using System.Text.Json.Serialization;

namespace Web.API.Domain.Production;

public class MeasurementUnit
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("unit_category")]
    public string UnitCategory { get; set; } = string.Empty;

    [JsonPropertyName("unit_symbol")]
    public string UnitSymbol { get; set; } = string.Empty;

    [JsonPropertyName("unit_name")]
    public string UnitName { get; set; } = string.Empty;

    [JsonPropertyName("is_deleted")]
    public bool? IsDeleted { get; set; }

    [JsonPropertyName("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.Now;

    [JsonPropertyName("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

public class SystemSetting
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("pressure_unit_id")]
    public int PressureUnitId { get; set; }

    [JsonPropertyName("cycle_time_unit_id")]
    public int CycleTimeUnitId { get; set; }

    [JsonPropertyName("backup_db_location")]
    public string? BackupDbLocation { get; set; }

    [JsonPropertyName("backup_schedule")]
    public string BackupSchedule { get; set; } = "daily";

    [JsonPropertyName("plc_ip_address")]
    public string? PlcIpAddress { get; set; }

    [JsonPropertyName("electricity_rate_per_kwh")]
    public decimal ElectricityRatePerKwh { get; set; }

    [JsonPropertyName("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.Now;

    [JsonPropertyName("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.Now;

    [JsonIgnore]
    public MeasurementUnit? PressureUnit { get; set; }

    [JsonIgnore]
    public MeasurementUnit? CycleTimeUnit { get; set; }
}

public class SystemSettingsResponse
{
    [JsonPropertyName("pressure_unit")]
    public string PressureUnit { get; set; } = "MPa";

    [JsonPropertyName("cycle_time_unit")]
    public string CycleTimeUnit { get; set; } = "s";

    [JsonPropertyName("backup_db_location")]
    public string BackupDbLocation { get; set; } = string.Empty;

    [JsonPropertyName("backup_schedule")]
    public string BackupSchedule { get; set; } = "daily";

    [JsonPropertyName("plc_ip_address")]
    public string PlcIpAddress { get; set; } = string.Empty;

    [JsonPropertyName("electricity_rate_per_kwh")]
    public decimal ElectricityRatePerKwh { get; set; }
}

public class UpdateSystemSettingsRequest
{
    [JsonPropertyName("pressure_unit")]
    public string PressureUnit { get; set; } = "MPa";

    [JsonPropertyName("cycle_time_unit")]
    public string CycleTimeUnit { get; set; } = "s";

    [JsonPropertyName("backup_db_location")]
    public string? BackupDbLocation { get; set; }

    [JsonPropertyName("backup_schedule")]
    public string BackupSchedule { get; set; } = "daily";

    [JsonPropertyName("plc_ip_address")]
    public string? PlcIpAddress { get; set; }

    [JsonPropertyName("electricity_rate_per_kwh")]
    public decimal ElectricityRatePerKwh { get; set; }
}

public class MqttSensorTopicConfig
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("sensor_type_id")]
    public int? SensorTypeId { get; set; }

    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("topic")]
    public string Topic { get; set; } = string.Empty;

    [JsonPropertyName("qos")]
    public int Qos { get; set; } = 1;

    [JsonPropertyName("enabled")]
    public bool Enabled { get; set; } = true;

    [JsonPropertyName("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.Now;

    [JsonPropertyName("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

public class ShmsSite
{
    public long Id { get; set; }
    public string SiteCode { get; set; } = string.Empty;
    public string SiteName { get; set; } = string.Empty;
    public string? OwnerName { get; set; }
    public string? AddressLine { get; set; }
    public string? City { get; set; }
    public string? Province { get; set; }
    public string CountryCode { get; set; } = "ID";
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public string Timezone { get; set; } = "Asia/Jakarta";
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

public class StructuralAsset
{
    public long Id { get; set; }
    public long SiteId { get; set; }
    public string AssetCode { get; set; } = string.Empty;
    public string AssetName { get; set; } = string.Empty;
    public string AssetType { get; set; } = string.Empty;
    public int? DesignLifeYears { get; set; }
    public DateOnly? CommissionedAt { get; set; }
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

public class AssetZone
{
    public long Id { get; set; }
    public long AssetId { get; set; }
    public string ZoneCode { get; set; } = string.Empty;
    public string ZoneName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

public class SensorType
{
    public int Id { get; set; }
    public string SensorCode { get; set; } = string.Empty;
    public string SensorName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? DefaultUnitId { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

public class SensorDevice
{
    public long Id { get; set; }
    public long SiteId { get; set; }
    public long? AssetId { get; set; }
    public long? ZoneId { get; set; }
    public int SensorTypeId { get; set; }
    public string DeviceCode { get; set; } = string.Empty;
    public string DeviceName { get; set; } = string.Empty;
    public string? SerialNumber { get; set; }
    public string? Manufacturer { get; set; }
    public string? ModelNumber { get; set; }
    public DateTime? InstalledAt { get; set; }
    public DateTime? LastCalibratedAt { get; set; }
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public decimal? ElevationM { get; set; }
    public string Status { get; set; } = "active";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

public class SensorChannel
{
    public long Id { get; set; }
    public long SensorDeviceId { get; set; }
    public int UnitId { get; set; }
    public string ChannelCode { get; set; } = string.Empty;
    public string ChannelName { get; set; } = string.Empty;
    public string MeasurementName { get; set; } = string.Empty;
    public string? Axis { get; set; }
    public decimal? MinOperatingValue { get; set; }
    public decimal? MaxOperatingValue { get; set; }
    public int? SamplingIntervalSeconds { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

public class SensorReading
{
    public long Id { get; set; }
    public long SensorChannelId { get; set; }
    public DateTime MeasuredAt { get; set; }
    public decimal NumericValue { get; set; }
    public string QualityCode { get; set; } = "good";
    public string? RawPayload { get; set; }
    public DateTime IngestedAt { get; set; } = DateTime.Now;
}

public class MqttBrokerConfig
{
    public int Id { get; set; }
    public string ConfigName { get; set; } = "default";
    public string Host { get; set; } = "broker.emqx.io";
    public int Port { get; set; } = 1883;
    public string ClientId { get; set; } = "SHMSClient";
    public string? Username { get; set; }
    public string? PasswordSecretName { get; set; }
    public bool UseTls { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

public class AlertRule
{
    public long Id { get; set; }
    public long SensorChannelId { get; set; }
    public string RuleCode { get; set; } = string.Empty;
    public string RuleName { get; set; } = string.Empty;
    public string Operator { get; set; } = ">=";
    public decimal ThresholdValue { get; set; }
    public string Severity { get; set; } = "warning";
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

public class AlertEvent
{
    public long Id { get; set; }
    public long AlertRuleId { get; set; }
    public long? SensorReadingId { get; set; }
    public DateTime TriggeredAt { get; set; }
    public string Severity { get; set; } = "warning";
    public string Message { get; set; } = string.Empty;
    public DateTime? AcknowledgedAt { get; set; }
    public int? AcknowledgedByUserId { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.Now;
}

public class ServerSyncStatus
{
    public int Id { get; set; }
    public string ServerName { get; set; } = "Witon Server";
    public string? EndpointUrl { get; set; }
    public bool IsOnline { get; set; }
    public DateTime? OutageStartedAt { get; set; }
    public DateTime? LastSuccessAt { get; set; }
    public DateTime? LastFailureAt { get; set; }
    public string? LastError { get; set; }
    public long RedisBufferCount { get; set; }
    public long DbSpilloverCount { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

public class MqttConfigurationResponse
{
    [JsonPropertyName("broker_host")]
    public string BrokerHost { get; set; } = "broker.emqx.io";

    [JsonPropertyName("broker_port")]
    public string BrokerPort { get; set; } = "1883";

    [JsonPropertyName("client_id")]
    public string ClientId { get; set; } = "SHMSClient";

    [JsonPropertyName("topics")]
    public List<MqttSensorTopicConfig> Topics { get; set; } = [];
}

public class UpdateMqttConfigurationRequest
{
    [JsonPropertyName("broker_host")]
    public string? BrokerHost { get; set; }

    [JsonPropertyName("broker_port")]
    public string? BrokerPort { get; set; }

    [JsonPropertyName("client_id")]
    public string? ClientId { get; set; }

    [JsonPropertyName("topics")]
    public List<MqttSensorTopicConfig> Topics { get; set; } = [];
}
