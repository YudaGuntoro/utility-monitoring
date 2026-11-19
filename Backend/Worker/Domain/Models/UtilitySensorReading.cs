namespace Worker.Domain.Models;

public sealed class UtilitySensorReading
{
    public string DeviceCode { get; init; } = string.Empty;
    public string SensorCode { get; init; } = string.Empty;
    public string ChannelCode { get; init; } = string.Empty;
    public string MeasurementName { get; init; } = string.Empty;
    public string? Axis { get; init; }
    public string UnitSymbol { get; init; } = string.Empty;
    public string UnitCategory { get; init; } = string.Empty;
    public decimal NumericValue { get; init; }
    public DateTime MeasuredAt { get; init; }
    public string QualityCode { get; init; } = "good";
    public string RawPayload { get; init; } = string.Empty;
}
