using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Web.API.Domain.Production;

public class PowerDevice
{
    public long Id { get; set; }
    public string DeviceCode { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Model { get; set; } = "Schneider PM8000 / PM8240";
    public string Location { get; set; } = string.Empty;
    public string GatewayId { get; set; } = string.Empty;
    public string MqttTopic { get; set; } = string.Empty;
    public string Status { get; set; } = "offline";
    public bool Enabled { get; set; } = true;
    public DateTime? LastSeen { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public PowerLatestTelemetry? LatestTelemetry { get; set; }
}

public class PowerLatestTelemetry
{
    public long Id { get; set; }
    public long DeviceId { get; set; }
    public DateTime Timestamp { get; set; }
    public decimal? VoltageL1n { get; set; }
    public decimal? VoltageL2n { get; set; }
    public decimal? VoltageL3n { get; set; }
    public decimal? VoltageL1l2 { get; set; }
    public decimal? VoltageL2l3 { get; set; }
    public decimal? VoltageL3l1 { get; set; }
    public decimal? CurrentL1 { get; set; }
    public decimal? CurrentL2 { get; set; }
    public decimal? CurrentL3 { get; set; }
    public decimal? CurrentNeutral { get; set; }
    public decimal? ActivePowerKw { get; set; }
    public decimal? ReactivePowerKvar { get; set; }
    public decimal? ApparentPowerKva { get; set; }
    public decimal? PowerFactor { get; set; }
    public decimal? FrequencyHz { get; set; }
    public decimal? EnergyImportKwh { get; set; }
    public decimal? EnergyExportKwh { get; set; }
    public DateTime ReceivedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class PowerTelemetryHistory
{
    public long Id { get; set; }
    public long DeviceId { get; set; }
    public DateTime Timestamp { get; set; }
    public decimal? VoltageL1n { get; set; }
    public decimal? VoltageL2n { get; set; }
    public decimal? VoltageL3n { get; set; }
    public decimal? VoltageL1l2 { get; set; }
    public decimal? VoltageL2l3 { get; set; }
    public decimal? VoltageL3l1 { get; set; }
    public decimal? CurrentL1 { get; set; }
    public decimal? CurrentL2 { get; set; }
    public decimal? CurrentL3 { get; set; }
    public decimal? CurrentNeutral { get; set; }
    public decimal? ActivePowerKw { get; set; }
    public decimal? ReactivePowerKvar { get; set; }
    public decimal? ApparentPowerKva { get; set; }
    public decimal? PowerFactor { get; set; }
    public decimal? FrequencyHz { get; set; }
    public decimal? EnergyImportKwh { get; set; }
    public decimal? EnergyExportKwh { get; set; }
    public DateTime ReceivedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class UpsertPowerDeviceRequest
{
    [Required]
    [JsonPropertyName("device_code")]
    public string DeviceCode { get; set; } = string.Empty;

    [Required]
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("model")]
    public string Model { get; set; } = "Schneider PM8000 / PM8240";

    [JsonPropertyName("location")]
    public string Location { get; set; } = string.Empty;

    [JsonPropertyName("gateway_id")]
    public string GatewayId { get; set; } = string.Empty;

    [JsonPropertyName("mqtt_topic")]
    public string MqttTopic { get; set; } = string.Empty;

    [JsonPropertyName("enabled")]
    public bool Enabled { get; set; } = true;
}
