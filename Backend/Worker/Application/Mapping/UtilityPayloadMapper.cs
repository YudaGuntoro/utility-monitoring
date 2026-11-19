using Newtonsoft.Json.Linq;
using System.Globalization;
using System.Text.RegularExpressions;
using Worker.Domain.Models;
using Worker.Domain.Payloads;
using Worker.Shared;

namespace Worker.Application.Mapping;

public static class UtilityPayloadMapper
{
    private static readonly Regex DeviceCodePattern = new(@"\b(tilt|atrh|vw|acc)\d+\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static IReadOnlyList<UtilitySensorReading> ToSensorReadings(string topic, string payload)
    {
        if (LooksLikeJson(payload))
        {
            return new[] { ToSensorReading(topic, payload) };
        }

        return ToCsvSensorReadings(topic, payload);
    }

    public static UtilitySensorReading ToSensorReading(string topic, string payload)
    {
        if (string.IsNullOrWhiteSpace(payload))
        {
            throw new FormatException("MQTT payload is empty.");
        }

        var utilityPayload = new UtilityPayload
        {
            Topic = topic,
            Data = ParsePayload(payload)
        };

        var sensorCode = NormalizeSensorCode(FirstText(
            ReadString(utilityPayload.Data, "sensor_code", "sensorCode", "sensor", "type"),
            SensorFromTopic(topic)));
        var deviceCode = NormalizeDeviceCode(FirstText(
            ReadString(utilityPayload.Data, "device_id", "deviceId", "device_code", "deviceCode", "device", "serial_number"),
            DeviceFromTopic(topic, sensorCode)));
        var axis = NormalizeAxis(ReadString(utilityPayload.Data, "axis", "Axis"));
        var measurementName = NormalizeMeasurementName(FirstText(
            ReadString(utilityPayload.Data, "measurement_name", "measurementName", "measurement", "metric"),
            MeasurementFromSensor(sensorCode)));
        var channelCode = NormalizeChannelCode(FirstText(
            ReadString(utilityPayload.Data, "channel_code", "channelCode", "channel", "channel_no"),
            BuildChannelCode(sensorCode, measurementName, axis)));
        var value = ReadDecimal(utilityPayload.Data, "value", "numeric_value", "numericValue", measurementName, channelCode);
        var unitSymbol = NormalizeUnitSymbol(FirstText(ReadString(utilityPayload.Data, "unit", "unit_symbol", "unitSymbol"), DefaultUnitSymbol(sensorCode, measurementName)));
        var unitCategory = NormalizeMeasurementName(FirstText(ReadString(utilityPayload.Data, "unit_category", "unitCategory"), DefaultUnitCategory(sensorCode, measurementName)));

        if (!value.HasValue)
        {
            throw new FormatException("MQTT payload missing numeric value.");
        }

        var reading = new UtilitySensorReading
        {
            DeviceCode = deviceCode,
            SensorCode = sensorCode,
            ChannelCode = channelCode,
            MeasurementName = measurementName,
            Axis = axis,
            UnitSymbol = unitSymbol,
            UnitCategory = unitCategory,
            NumericValue = value.Value,
            MeasuredAt = NormalizeMeasuredAt(ReadDateTime(utilityPayload.Data, "measured_at", "measuredAt", "timestamp", "time_stamp", "ts")),
            QualityCode = NormalizeQuality(ReadString(utilityPayload.Data, "quality_code", "qualityCode", "quality")),
            RawPayload = payload
        };

        Validate(reading);
        return reading;
    }

    private static JObject ParsePayload(string payload)
    {
        var token = JToken.Parse(payload);
        if (token is JObject obj)
        {
            return obj;
        }

        throw new FormatException("MQTT payload must be a JSON object.");
    }

    private static IReadOnlyList<UtilitySensorReading> ToCsvSensorReadings(string topic, string payload)
    {
        var values = payload
            .Split(',', StringSplitOptions.TrimEntries)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToArray();

        if (values.Length < 2)
        {
            throw new FormatException("CSV MQTT payload must contain timestamp and at least one numeric value.");
        }

        if (!DateTime.TryParse(values[0], CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var parsedMeasuredAt))
        {
            throw new FormatException("CSV MQTT payload timestamp is invalid.");
        }

        var measuredAt = NormalizeMeasuredAt(parsedMeasuredAt);
        var deviceCode = NormalizeDeviceCode(DeviceFromRawTopic(topic));
        var sensorCode = SensorFromDeviceCode(deviceCode);
        var definitions = CsvChannelDefinitions(sensorCode);
        var numericValues = values.Skip(1).ToArray();

        if (numericValues.Length > definitions.Count)
        {
            throw new FormatException($"CSV MQTT payload has too many values for {sensorCode}. Expected {definitions.Count}, got {numericValues.Length}.");
        }

        var rawPayload = BuildRawCsvPayload(topic, payload, deviceCode, sensorCode, measuredAt);
        var readings = new List<UtilitySensorReading>();
        for (var index = 0; index < numericValues.Length; index++)
        {
            if (!decimal.TryParse(numericValues[index], NumberStyles.Float, CultureInfo.InvariantCulture, out var numericValue))
            {
                throw new FormatException($"CSV MQTT payload value #{index + 1} is invalid.");
            }

            var definition = definitions[index];
            readings.Add(new UtilitySensorReading
            {
                DeviceCode = deviceCode,
                SensorCode = sensorCode,
                ChannelCode = NormalizeChannelCode($"{deviceCode}-{definition.ChannelCode}"),
                MeasurementName = NormalizeMeasurementName(definition.MeasurementName),
                Axis = NormalizeAxis(definition.Axis),
                UnitSymbol = NormalizeUnitSymbol(definition.UnitSymbol),
                UnitCategory = NormalizeMeasurementName(definition.UnitCategory),
                NumericValue = numericValue,
                MeasuredAt = measuredAt,
                QualityCode = "good",
                RawPayload = rawPayload
            });
        }

        return readings;
    }

    private static bool LooksLikeJson(string payload)
    {
        var trimmed = payload.TrimStart();
        return trimmed.StartsWith("{", StringComparison.Ordinal) || trimmed.StartsWith("[", StringComparison.Ordinal);
    }

    private static string DeviceFromRawTopic(string topic)
    {
        var match = DeviceCodePattern.Match(topic);
        if (match.Success)
        {
            return NormalizeDeviceCode(match.Value);
        }

        var machineName = SignalHelper.TopicToMachineName(topic);
        match = DeviceCodePattern.Match(machineName);
        if (match.Success)
        {
            return NormalizeDeviceCode(match.Value);
        }

        throw new FormatException("CSV MQTT topic must contain device code like tilt01, atrh01, vw01, or acc03.");
    }

    private static string SensorFromDeviceCode(string deviceCode)
    {
        var letters = new string(deviceCode.TakeWhile(char.IsLetter).ToArray());
        return letters.ToUpperInvariant() switch
        {
            "TILT" => "TILT",
            "ATRH" => "ATRH",
            "VW" => "VW",
            "ACC" => "ACC",
            _ => throw new FormatException($"Unsupported sensor device code '{deviceCode}'.")
        };
    }

    private static IReadOnlyList<CsvChannelDefinition> CsvChannelDefinitions(string sensorCode) =>
        sensorCode.ToUpperInvariant() switch
        {
            "TILT" => new[]
            {
                new CsvChannelDefinition("tilt_x", "tilt", "X", "deg", "angle"),
                new CsvChannelDefinition("tilt_y", "tilt", "Y", "deg", "angle"),
                new CsvChannelDefinition("temp_1", "temperature", "T1", "C", "temperature"),
                new CsvChannelDefinition("temp_2", "temperature", "T2", "C", "temperature"),
                new CsvChannelDefinition("raw_x", "raw", "X", "count", "raw"),
                new CsvChannelDefinition("raw_y", "raw", "Y", "count", "raw"),
            },
            "ATRH" => new[]
            {
                new CsvChannelDefinition("temperature", "temperature", null, "C", "temperature"),
                new CsvChannelDefinition("humidity", "humidity", null, "%RH", "humidity"),
                new CsvChannelDefinition("raw_1", "raw", "1", "count", "raw"),
                new CsvChannelDefinition("raw_2", "raw", "2", "count", "raw"),
                new CsvChannelDefinition("raw_3", "raw", "3", "count", "raw"),
            },
            "VW" => new[]
            {
                new CsvChannelDefinition("frequency", "frequency", null, "Hz", "frequency"),
                new CsvChannelDefinition("temperature", "temperature", null, "C", "temperature"),
                new CsvChannelDefinition("reading", "reading", null, "unit", "generic"),
                new CsvChannelDefinition("raw_frequency", "raw", "frequency", "count", "raw"),
            },
            "ACC" => new[]
            {
                new CsvChannelDefinition("acc_x", "acceleration", "X", "count", "acceleration"),
                new CsvChannelDefinition("acc_y", "acceleration", "Y", "count", "acceleration"),
                new CsvChannelDefinition("acc_z", "acceleration", "Z", "count", "acceleration"),
            },
            _ => throw new FormatException($"Unsupported CSV sensor code '{sensorCode}'.")
        };

    private static string BuildRawCsvPayload(string topic, string payload, string deviceCode, string sensorCode, DateTime measuredAt) =>
        new JObject
        {
            ["format"] = "csv",
            ["topic"] = topic,
            ["device_code"] = deviceCode,
            ["sensor_code"] = sensorCode,
            ["measured_at"] = measuredAt.ToString("O"),
            ["payload"] = payload
        }.ToString(Newtonsoft.Json.Formatting.None);

    private static string? ReadString(JObject source, params string[] keys)
    {
        foreach (var key in keys)
        {
            var token = source.SelectToken(key, false) ?? source.GetValue(key, StringComparison.OrdinalIgnoreCase);
            var text = token?.Type == JTokenType.Null ? null : token?.ToString();
            if (!string.IsNullOrWhiteSpace(text))
            {
                return text.Trim();
            }
        }

        return null;
    }

    private static decimal? ReadDecimal(JObject source, params string[] keys)
    {
        foreach (var key in keys.Where(key => !string.IsNullOrWhiteSpace(key)))
        {
            var token = source.SelectToken(key, false) ?? source.GetValue(key, StringComparison.OrdinalIgnoreCase);
            if (token == null || token.Type == JTokenType.Null)
            {
                continue;
            }

            if (decimal.TryParse(token.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var value)
                || decimal.TryParse(token.ToString(), NumberStyles.Float, CultureInfo.CurrentCulture, out value))
            {
                return value;
            }
        }

        return null;
    }

    private static DateTime? ReadDateTime(JObject source, params string[] keys)
    {
        foreach (var key in keys)
        {
            var token = source.SelectToken(key, false) ?? source.GetValue(key, StringComparison.OrdinalIgnoreCase);
            if (token == null || token.Type == JTokenType.Null)
            {
                continue;
            }

            if (DateTime.TryParse(token.ToString(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var value)
                || DateTime.TryParse(token.ToString(), CultureInfo.CurrentCulture, DateTimeStyles.AssumeLocal, out value))
            {
                return value;
            }
        }

        return null;
    }

    private static string SensorFromTopic(string topic)
    {
        var text = topic.ToUpperInvariant();
        foreach (var code in new[] { "TILT", "VW", "ATRH", "ACC" })
        {
            if (text.Contains(code, StringComparison.Ordinal))
            {
                return code;
            }
        }

        return "GEN";
    }

    private static string DeviceFromTopic(string topic, string sensorCode)
    {
        var machineName = SignalHelper.TopicToMachineName(topic);
        return string.IsNullOrWhiteSpace(machineName)
            ? $"Utility-{sensorCode}-01"
            : machineName;
    }

    private static string MeasurementFromSensor(string sensorCode) =>
        sensorCode.ToUpperInvariant() switch
        {
            "TILT" => "tilt",
            "VW" => "frequency",
            "ATRH" => "temperature",
            "ACC" => "acceleration",
            _ => "measurement"
        };

    private static string BuildChannelCode(string sensorCode, string measurementName, string? axis)
    {
        var suffix = string.IsNullOrWhiteSpace(axis) ? measurementName : axis;
        return NormalizeChannelCode($"{sensorCode}-{suffix}");
    }

    private static string DefaultUnitSymbol(string sensorCode, string measurementName) =>
        (sensorCode.ToUpperInvariant(), measurementName.ToLowerInvariant()) switch
        {
            ("TILT", _) => "deg",
            ("VW", _) => "Hz",
            ("ATRH", "humidity") => "%RH",
            ("ATRH", _) => "C",
            ("ACC", _) => "g",
            _ => "unit"
        };

    private static string DefaultUnitCategory(string sensorCode, string measurementName) =>
        (sensorCode.ToUpperInvariant(), measurementName.ToLowerInvariant()) switch
        {
            ("TILT", _) => "angle",
            ("VW", _) => "frequency",
            ("ATRH", "humidity") => "humidity",
            ("ATRH", _) => "temperature",
            ("ACC", _) => "acceleration",
            _ => "generic"
        };

    private static string NormalizeQuality(string? quality)
    {
        var normalized = string.IsNullOrWhiteSpace(quality) ? "good" : quality.Trim().ToLowerInvariant();
        return normalized is "good" or "suspect" or "bad" or "missing" ? normalized : "good";
    }

    private static string NormalizeDeviceCode(string? value) =>
        NormalizeCode(value, "UNKNOWN");

    private static string NormalizeSensorCode(string? value) =>
        NormalizeCode(value, "GEN");

    private static string NormalizeChannelCode(string? value) =>
        NormalizeCode(value, "CHANNEL");

    private static string? NormalizeAxis(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return NormalizeCode(value, string.Empty);
    }

    private static string NormalizeCode(string? value, string fallback)
    {
        var text = string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
        text = Regex.Replace(text, @"[^A-Za-z0-9]+", "_").Trim('_');
        return string.IsNullOrWhiteSpace(text) ? fallback : text.ToUpperInvariant();
    }

    private static string NormalizeMeasurementName(string? value)
    {
        var text = string.IsNullOrWhiteSpace(value) ? "measurement" : value.Trim();
        text = Regex.Replace(text, @"[^A-Za-z0-9]+", "_").Trim('_');
        return string.IsNullOrWhiteSpace(text) ? "measurement" : text.ToLowerInvariant();
    }

    private static string NormalizeUnitSymbol(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "unit";
        }

        return value.Trim() switch
        {
            "c" => "C",
            "C" => "C",
            "%rh" => "%RH",
            "%RH" => "%RH",
            var text => text
        };
    }

    private static DateTime NormalizeMeasuredAt(DateTime? value)
    {
        var measuredAt = value ?? DateTime.Now;

        // Some sensor RTCs publish default year-2000 timestamps. Use ingest time
        // so realtime dashboards and retention filters still behave correctly.
        if (measuredAt.Year < 2020)
        {
            return DateTime.Now;
        }

        return measuredAt.Kind == DateTimeKind.Utc ? measuredAt.ToLocalTime() : measuredAt;
    }

    private static string FirstText(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim() ?? string.Empty;

    private static void Validate(UtilitySensorReading reading)
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(reading.SensorCode)) missing.Add("sensor_code");
        if (string.IsNullOrWhiteSpace(reading.DeviceCode)) missing.Add("device_id/device_code");
        if (string.IsNullOrWhiteSpace(reading.ChannelCode)) missing.Add("channel_code");
        if (string.IsNullOrWhiteSpace(reading.MeasurementName)) missing.Add("measurement_name");

        if (missing.Count > 0)
        {
            throw new FormatException($"MQTT payload missing/invalid fields: {string.Join(", ", missing)}.");
        }
    }

    private sealed record CsvChannelDefinition(
        string ChannelCode,
        string MeasurementName,
        string? Axis,
        string UnitSymbol,
        string UnitCategory);
}
