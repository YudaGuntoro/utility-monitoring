using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;


namespace Web.API.Domain.Production;

[Table("utility_types")]
public class UtilityType
{
    [MaxLength(20)] public string Code { get; set; } = "";
    [MaxLength(80)] public string Name { get; set; } = "";
}

[Table("utility_devices")]
public class UtilityDevice
{
    public long Id { get; set; }
    [MaxLength(20)] public string Kind { get; set; } = "water";
    [MaxLength(50)] public string DeviceCode { get; set; } = "";
    [MaxLength(150)] public string Name { get; set; } = "";
    [MaxLength(150)] public string Location { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public decimal? LowPressureBar { get; set; }
    public decimal? HighFlowRate { get; set; }
    public List<UtilityReading> Readings { get; set; } = new();
}

[Table("utility_readings")]
public class UtilityReading
{
    public long Id { get; set; }
    public long DeviceId { get; set; }
    public DateTime Timestamp { get; set; }
    public DateTime ReceivedAt { get; set; }
    public decimal FlowRate { get; set; }
    public decimal TotalVolume { get; set; }
    public decimal? PressureBar { get; set; }
    public decimal? TemperatureC { get; set; }
    public decimal? PowerKw { get; set; }
}

public class UtilityDeviceRequest
{
    [Required, RegularExpression("^[A-Za-z0-9_-]{1,50}$")] public string DeviceCode { get; set; } = "";
    [Required, StringLength(150)] public string Name { get; set; } = "";
    [StringLength(150)] public string Location { get; set; } = "";
    public bool Enabled { get; set; } = true;
    [Range(0, 1000000)] public decimal? LowPressureBar { get; set; }
    [Range(0, 1000000000)] public decimal? HighFlowRate { get; set; }
}

public class UtilityReadingRequest
{
    [System.Text.Json.Serialization.JsonRequired]
    public DateTimeOffset Timestamp { get; set; }
    [System.Text.Json.Serialization.JsonRequired]
    public decimal FlowRate { get; set; }
    [System.Text.Json.Serialization.JsonRequired]
    public decimal TotalVolume { get; set; }
    public decimal? PressureBar { get; set; }
    public decimal? TemperatureC { get; set; }
    public decimal? PowerKw { get; set; }
}
