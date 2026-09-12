using Microsoft.EntityFrameworkCore;
using Web.API.Domain.Auth;
using Web.API.Domain.Production;

namespace Web.API.Persistence.Context;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<AppRole> Roles => Set<AppRole>();
    public DbSet<MeasurementUnit> MeasurementUnits => Set<MeasurementUnit>();
    public DbSet<ShmsSite> ShmsSites => Set<ShmsSite>();
    public DbSet<StructuralAsset> StructuralAssets => Set<StructuralAsset>();
    public DbSet<AssetZone> AssetZones => Set<AssetZone>();
    public DbSet<SensorType> SensorTypes => Set<SensorType>();
    public DbSet<SensorDevice> SensorDevices => Set<SensorDevice>();
    public DbSet<SensorChannel> SensorChannels => Set<SensorChannel>();
    public DbSet<SensorReading> SensorReadings => Set<SensorReading>();
    public DbSet<MqttBrokerConfig> MqttBrokerConfigs => Set<MqttBrokerConfig>();
    public DbSet<MqttSensorTopicConfig> MqttSensorTopicConfigs => Set<MqttSensorTopicConfig>();
    public DbSet<PowerDevice> PowerDevices => Set<PowerDevice>();
    public DbSet<PowerLatestTelemetry> PowerLatestTelemetry => Set<PowerLatestTelemetry>();
    public DbSet<PowerTelemetryHistory> PowerTelemetryHistory => Set<PowerTelemetryHistory>();
    public DbSet<AlertRule> AlertRules => Set<AlertRule>();
    public DbSet<AlertEvent> AlertEvents => Set<AlertEvent>();
    public DbSet<ServerSyncStatus> ServerSyncStatuses => Set<ServerSyncStatus>();
    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();
    public DbSet<LogBuffer> LogBuffers => Set<LogBuffer>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<LogBuffer>(entity =>
        {
            entity.ToTable("log_buffer");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.SensorDeviceId).HasColumnName("sensor_device_id");
            entity.Property(x => x.DeviceId).HasColumnName("device_id").HasMaxLength(100).IsRequired();
            entity.Property(x => x.Topic).HasColumnName("topic").HasMaxLength(255);
            entity.Property(x => x.Payload).HasColumnName("payload").HasColumnType("longtext").IsRequired();
            entity.Property(x => x.TimeStamp).HasColumnName("time_stamp");
            entity.Property(x => x.Status).HasColumnName("status").HasMaxLength(30).IsRequired();
            entity.Property(x => x.RetryCount).HasColumnName("retry_count");
            entity.Property(x => x.LastError).HasColumnName("last_error").HasColumnType("text");
            entity.Property(x => x.UploadedAt).HasColumnName("uploaded_at");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(x => x.TimeStamp).HasDatabaseName("ix_log_buffer_time_stamp");
            entity.HasIndex(x => new { x.Status, x.TimeStamp }).HasDatabaseName("ix_log_buffer_status_time_stamp");
            entity.HasIndex(x => new { x.DeviceId, x.TimeStamp }).HasDatabaseName("ix_log_buffer_device_time_stamp");
            entity.HasIndex(x => x.SensorDeviceId).HasDatabaseName("ix_log_buffer_sensor_device_id");
            entity.HasOne<SensorDevice>().WithMany().HasForeignKey(x => x.SensorDeviceId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<MqttSensorTopicConfig>(entity =>
        {
            entity.ToTable("mqtt_sensor_topics");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.SensorTypeId).HasColumnName("sensor_type_id");
            entity.Property(x => x.Code).HasColumnName("code").HasMaxLength(20).IsRequired();
            entity.Property(x => x.Name).HasColumnName("name").HasMaxLength(100).IsRequired();
            entity.Property(x => x.Topic).HasColumnName("topic").HasMaxLength(255).IsRequired();
            entity.Property(x => x.Qos).HasColumnName("qos");
            entity.Property(x => x.Enabled).HasColumnName("enabled");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => x.Code).IsUnique().HasDatabaseName("uq_mqtt_sensor_topics_code");
            entity.HasIndex(x => x.Topic).IsUnique().HasDatabaseName("uq_mqtt_sensor_topics_topic");
            entity.HasIndex(x => x.Enabled).HasDatabaseName("ix_mqtt_sensor_topics_enabled");
            entity.HasIndex(x => x.SensorTypeId).HasDatabaseName("ix_mqtt_sensor_topics_sensor_type_id");
            entity.HasOne<SensorType>().WithMany().HasForeignKey(x => x.SensorTypeId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<PowerDevice>(entity =>
        {
            entity.ToTable("power_devices");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.DeviceCode).HasColumnName("device_code").HasMaxLength(50).IsRequired();
            entity.Property(x => x.Name).HasColumnName("name").HasMaxLength(150).IsRequired();
            entity.Property(x => x.Model).HasColumnName("model").HasMaxLength(150).IsRequired();
            entity.Property(x => x.Location).HasColumnName("location").HasMaxLength(150);
            entity.Property(x => x.GatewayId).HasColumnName("gateway_id").HasMaxLength(80);
            entity.Property(x => x.MqttTopic).HasColumnName("mqtt_topic").HasMaxLength(255).IsRequired();
            entity.Property(x => x.Status).HasColumnName("status").HasMaxLength(30).IsRequired();
            entity.Property(x => x.Enabled).HasColumnName("enabled");
            entity.Property(x => x.LastSeen).HasColumnName("last_seen");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => x.DeviceCode).IsUnique().HasDatabaseName("uq_power_devices_device_code");
            entity.HasIndex(x => x.Status).HasDatabaseName("ix_power_devices_status");
            entity.HasOne(x => x.LatestTelemetry).WithOne().HasForeignKey<PowerLatestTelemetry>(x => x.DeviceId).OnDelete(DeleteBehavior.Cascade);
        });

        ConfigurePowerTelemetry(modelBuilder.Entity<PowerLatestTelemetry>(), "power_latest_telemetry");
        ConfigurePowerTelemetry(modelBuilder.Entity<PowerTelemetryHistory>(), "power_telemetry_history", uniqueDevice: false);

        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Username).HasColumnName("username").HasMaxLength(80).IsRequired();
            entity.Property(x => x.FullName).HasColumnName("full_name").HasMaxLength(150).IsRequired();
            entity.Property(x => x.Email).HasColumnName("email").HasMaxLength(150);
            entity.Property(x => x.Phone).HasColumnName("phone").HasMaxLength(50);
            entity.Property(x => x.RolesId).HasColumnName("roles_id");
            entity.Property(x => x.IsActive).HasColumnName("is_active");
            entity.Property(x => x.PasswordHash).HasColumnName("password_hash").HasMaxLength(255).IsRequired();
            entity.Property(x => x.PasswordSalt).HasColumnName("password_salt").HasMaxLength(255).IsRequired();
            entity.Property(x => x.LastLoginAt).HasColumnName("last_login_at");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasOne(x => x.Role).WithMany().HasForeignKey(x => x.RolesId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(x => x.Username).IsUnique();
            entity.HasIndex(x => x.Email).IsUnique();
            entity.HasIndex(x => x.RolesId);
        });

        modelBuilder.Entity<AppRole>(entity =>
        {
            entity.ToTable("roles");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.Name).HasColumnName("role_name").HasMaxLength(30).IsRequired();
            entity.Property(x => x.Description).HasColumnName("description").HasMaxLength(120);
            entity.Property(x => x.IsActive).HasColumnName("is_active");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => x.Name).IsUnique();
        });

        modelBuilder.Entity<MeasurementUnit>(entity =>
        {
            entity.ToTable("measurement_units");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.UnitCategory).HasColumnName("unit_category").HasMaxLength(50).IsRequired();
            entity.Property(x => x.UnitSymbol).HasColumnName("unit_symbol").HasMaxLength(20).IsRequired();
            entity.Property(x => x.UnitName).HasColumnName("unit_name").HasMaxLength(80).IsRequired();
            entity.Property(x => x.IsDeleted).HasColumnName("is_deleted");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => new { x.UnitCategory, x.UnitSymbol }).IsUnique();
        });

        modelBuilder.Entity<ShmsSite>(entity =>
        {
            entity.ToTable("shms_sites");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.SiteCode).HasColumnName("site_code").HasMaxLength(50).IsRequired();
            entity.Property(x => x.SiteName).HasColumnName("site_name").HasMaxLength(150).IsRequired();
            entity.Property(x => x.OwnerName).HasColumnName("owner_name").HasMaxLength(150);
            entity.Property(x => x.AddressLine).HasColumnName("address_line").HasMaxLength(255);
            entity.Property(x => x.City).HasColumnName("city").HasMaxLength(100);
            entity.Property(x => x.Province).HasColumnName("province").HasMaxLength(100);
            entity.Property(x => x.CountryCode).HasColumnName("country_code").HasMaxLength(2).IsRequired();
            entity.Property(x => x.Latitude).HasColumnName("latitude").HasPrecision(10, 7);
            entity.Property(x => x.Longitude).HasColumnName("longitude").HasPrecision(10, 7);
            entity.Property(x => x.Timezone).HasColumnName("timezone").HasMaxLength(64).IsRequired();
            entity.Property(x => x.IsActive).HasColumnName("is_active");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => x.SiteCode).IsUnique().HasDatabaseName("uq_shms_sites_site_code");
            entity.HasIndex(x => new { x.Latitude, x.Longitude }).HasDatabaseName("ix_shms_sites_location");
        });

        modelBuilder.Entity<StructuralAsset>(entity =>
        {
            entity.ToTable("structural_assets");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.SiteId).HasColumnName("site_id");
            entity.Property(x => x.AssetCode).HasColumnName("asset_code").HasMaxLength(50).IsRequired();
            entity.Property(x => x.AssetName).HasColumnName("asset_name").HasMaxLength(150).IsRequired();
            entity.Property(x => x.AssetType).HasColumnName("asset_type").HasMaxLength(50).IsRequired();
            entity.Property(x => x.DesignLifeYears).HasColumnName("design_life_years");
            entity.Property(x => x.CommissionedAt).HasColumnName("commissioned_at");
            entity.Property(x => x.Description).HasColumnName("description").HasMaxLength(500);
            entity.Property(x => x.IsActive).HasColumnName("is_active");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => new { x.SiteId, x.AssetCode }).IsUnique().HasDatabaseName("uq_structural_assets_site_asset_code");
            entity.HasIndex(x => x.SiteId).HasDatabaseName("ix_structural_assets_site_id");
            entity.HasOne<ShmsSite>().WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AssetZone>(entity =>
        {
            entity.ToTable("asset_zones");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.AssetId).HasColumnName("asset_id");
            entity.Property(x => x.ZoneCode).HasColumnName("zone_code").HasMaxLength(50).IsRequired();
            entity.Property(x => x.ZoneName).HasColumnName("zone_name").HasMaxLength(150).IsRequired();
            entity.Property(x => x.Description).HasColumnName("description").HasMaxLength(500);
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => new { x.AssetId, x.ZoneCode }).IsUnique().HasDatabaseName("uq_asset_zones_asset_zone_code");
            entity.HasIndex(x => x.AssetId).HasDatabaseName("ix_asset_zones_asset_id");
            entity.HasOne<StructuralAsset>().WithMany().HasForeignKey(x => x.AssetId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<SensorType>(entity =>
        {
            entity.ToTable("sensor_types");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.SensorCode).HasColumnName("sensor_code").HasMaxLength(20).IsRequired();
            entity.Property(x => x.SensorName).HasColumnName("sensor_name").HasMaxLength(100).IsRequired();
            entity.Property(x => x.Description).HasColumnName("description").HasMaxLength(255);
            entity.Property(x => x.DefaultUnitId).HasColumnName("default_unit_id");
            entity.Property(x => x.IsActive).HasColumnName("is_active");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => x.SensorCode).IsUnique().HasDatabaseName("uq_sensor_types_sensor_code");
            entity.HasIndex(x => x.DefaultUnitId).HasDatabaseName("ix_sensor_types_default_unit_id");
            entity.HasOne<MeasurementUnit>().WithMany().HasForeignKey(x => x.DefaultUnitId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<SensorDevice>(entity =>
        {
            entity.ToTable("sensor_devices");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.SiteId).HasColumnName("site_id");
            entity.Property(x => x.AssetId).HasColumnName("asset_id");
            entity.Property(x => x.ZoneId).HasColumnName("zone_id");
            entity.Property(x => x.SensorTypeId).HasColumnName("sensor_type_id");
            entity.Property(x => x.DeviceCode).HasColumnName("device_code").HasMaxLength(80).IsRequired();
            entity.Property(x => x.DeviceName).HasColumnName("device_name").HasMaxLength(150).IsRequired();
            entity.Property(x => x.SerialNumber).HasColumnName("serial_number").HasMaxLength(100);
            entity.Property(x => x.Manufacturer).HasColumnName("manufacturer").HasMaxLength(100);
            entity.Property(x => x.ModelNumber).HasColumnName("model_number").HasMaxLength(100);
            entity.Property(x => x.InstalledAt).HasColumnName("installed_at");
            entity.Property(x => x.LastCalibratedAt).HasColumnName("last_calibrated_at");
            entity.Property(x => x.Latitude).HasColumnName("latitude").HasPrecision(10, 7);
            entity.Property(x => x.Longitude).HasColumnName("longitude").HasPrecision(10, 7);
            entity.Property(x => x.ElevationM).HasColumnName("elevation_m").HasPrecision(10, 3);
            entity.Property(x => x.Status).HasColumnName("status").HasMaxLength(30).IsRequired();
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => x.DeviceCode).IsUnique().HasDatabaseName("uq_sensor_devices_device_code");
            entity.HasIndex(x => x.SiteId).HasDatabaseName("ix_sensor_devices_site_id");
            entity.HasIndex(x => x.AssetId).HasDatabaseName("ix_sensor_devices_asset_id");
            entity.HasIndex(x => x.ZoneId).HasDatabaseName("ix_sensor_devices_zone_id");
            entity.HasIndex(x => x.SensorTypeId).HasDatabaseName("ix_sensor_devices_sensor_type_id");
            entity.HasIndex(x => x.Status).HasDatabaseName("ix_sensor_devices_status");
            entity.HasOne<ShmsSite>().WithMany().HasForeignKey(x => x.SiteId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<StructuralAsset>().WithMany().HasForeignKey(x => x.AssetId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne<AssetZone>().WithMany().HasForeignKey(x => x.ZoneId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne<SensorType>().WithMany().HasForeignKey(x => x.SensorTypeId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<SensorChannel>(entity =>
        {
            entity.ToTable("sensor_channels");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.SensorDeviceId).HasColumnName("sensor_device_id");
            entity.Property(x => x.UnitId).HasColumnName("unit_id");
            entity.Property(x => x.ChannelCode).HasColumnName("channel_code").HasMaxLength(80).IsRequired();
            entity.Property(x => x.ChannelName).HasColumnName("channel_name").HasMaxLength(150).IsRequired();
            entity.Property(x => x.MeasurementName).HasColumnName("measurement_name").HasMaxLength(100).IsRequired();
            entity.Property(x => x.Axis).HasColumnName("axis").HasMaxLength(10);
            entity.Property(x => x.MinOperatingValue).HasColumnName("min_operating_value").HasPrecision(18, 6);
            entity.Property(x => x.MaxOperatingValue).HasColumnName("max_operating_value").HasPrecision(18, 6);
            entity.Property(x => x.SamplingIntervalSeconds).HasColumnName("sampling_interval_seconds");
            entity.Property(x => x.IsActive).HasColumnName("is_active");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => new { x.SensorDeviceId, x.ChannelCode }).IsUnique().HasDatabaseName("uq_sensor_channels_device_channel_code");
            entity.HasIndex(x => x.SensorDeviceId).HasDatabaseName("ix_sensor_channels_sensor_device_id");
            entity.HasIndex(x => x.UnitId).HasDatabaseName("ix_sensor_channels_unit_id");
            entity.HasIndex(x => x.MeasurementName).HasDatabaseName("ix_sensor_channels_measurement_name");
            entity.HasOne<SensorDevice>().WithMany().HasForeignKey(x => x.SensorDeviceId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<MeasurementUnit>().WithMany().HasForeignKey(x => x.UnitId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<SensorReading>(entity =>
        {
            entity.ToTable("sensor_readings");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.SensorChannelId).HasColumnName("sensor_channel_id");
            entity.Property(x => x.MeasuredAt).HasColumnName("measured_at");
            entity.Property(x => x.NumericValue).HasColumnName("numeric_value").HasPrecision(20, 8);
            entity.Property(x => x.QualityCode).HasColumnName("quality_code").HasMaxLength(30).IsRequired();
            entity.Property(x => x.RawPayload).HasColumnName("raw_payload").HasColumnType("json");
            entity.Property(x => x.IngestedAt).HasColumnName("ingested_at");
            entity.HasIndex(x => new { x.SensorChannelId, x.MeasuredAt }).IsUnique().HasDatabaseName("uq_sensor_readings_channel_measured_at");
            entity.HasIndex(x => x.MeasuredAt).HasDatabaseName("ix_sensor_readings_measured_at");
            entity.HasIndex(x => x.QualityCode).HasDatabaseName("ix_sensor_readings_quality_code");
            entity.HasOne<SensorChannel>().WithMany().HasForeignKey(x => x.SensorChannelId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MqttBrokerConfig>(entity =>
        {
            entity.ToTable("mqtt_broker_configs");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.ConfigName).HasColumnName("config_name").HasMaxLength(100).IsRequired();
            entity.Property(x => x.Host).HasColumnName("host").HasMaxLength(255).IsRequired();
            entity.Property(x => x.Port).HasColumnName("port");
            entity.Property(x => x.ClientId).HasColumnName("client_id").HasMaxLength(100).IsRequired();
            entity.Property(x => x.Username).HasColumnName("username").HasMaxLength(100);
            entity.Property(x => x.PasswordSecretName).HasColumnName("password_secret_name").HasMaxLength(150);
            entity.Property(x => x.UseTls).HasColumnName("use_tls");
            entity.Property(x => x.IsActive).HasColumnName("is_active");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => x.ConfigName).IsUnique().HasDatabaseName("uq_mqtt_broker_configs_config_name");
        });

        modelBuilder.Entity<AlertRule>(entity =>
        {
            entity.ToTable("alert_rules");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.SensorChannelId).HasColumnName("sensor_channel_id");
            entity.Property(x => x.RuleCode).HasColumnName("rule_code").HasMaxLength(80).IsRequired();
            entity.Property(x => x.RuleName).HasColumnName("rule_name").HasMaxLength(150).IsRequired();
            entity.Property(x => x.Operator).HasColumnName("operator").HasMaxLength(20).IsRequired();
            entity.Property(x => x.ThresholdValue).HasColumnName("threshold_value").HasPrecision(20, 8);
            entity.Property(x => x.Severity).HasColumnName("severity").HasMaxLength(20).IsRequired();
            entity.Property(x => x.IsActive).HasColumnName("is_active");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => new { x.SensorChannelId, x.RuleCode }).IsUnique().HasDatabaseName("uq_alert_rules_channel_rule_code");
            entity.HasIndex(x => x.SensorChannelId).HasDatabaseName("ix_alert_rules_sensor_channel_id");
            entity.HasIndex(x => x.Severity).HasDatabaseName("ix_alert_rules_severity");
            entity.HasOne<SensorChannel>().WithMany().HasForeignKey(x => x.SensorChannelId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AlertEvent>(entity =>
        {
            entity.ToTable("alert_events");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.AlertRuleId).HasColumnName("alert_rule_id");
            entity.Property(x => x.SensorReadingId).HasColumnName("sensor_reading_id");
            entity.Property(x => x.TriggeredAt).HasColumnName("triggered_at");
            entity.Property(x => x.Severity).HasColumnName("severity").HasMaxLength(20).IsRequired();
            entity.Property(x => x.Message).HasColumnName("message").HasMaxLength(500).IsRequired();
            entity.Property(x => x.AcknowledgedAt).HasColumnName("acknowledged_at");
            entity.Property(x => x.AcknowledgedByUserId).HasColumnName("acknowledged_by_user_id");
            entity.Property(x => x.ResolvedAt).HasColumnName("resolved_at");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(x => x.TriggeredAt).HasDatabaseName("ix_alert_events_triggered_at");
            entity.HasIndex(x => new { x.Severity, x.TriggeredAt }).HasDatabaseName("ix_alert_events_severity_triggered_at");
            entity.HasIndex(x => x.AlertRuleId).HasDatabaseName("ix_alert_events_alert_rule_id");
            entity.HasIndex(x => x.SensorReadingId).HasDatabaseName("ix_alert_events_sensor_reading_id");
            entity.HasIndex(x => x.AcknowledgedByUserId).HasDatabaseName("ix_alert_events_acknowledged_by_user_id");
            entity.HasOne<AlertRule>().WithMany().HasForeignKey(x => x.AlertRuleId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<SensorReading>().WithMany().HasForeignKey(x => x.SensorReadingId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.AcknowledgedByUserId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ServerSyncStatus>(entity =>
        {
            entity.ToTable("server_sync_status");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.ServerName).HasColumnName("server_name").HasMaxLength(100).IsRequired();
            entity.Property(x => x.EndpointUrl).HasColumnName("endpoint_url").HasMaxLength(500);
            entity.Property(x => x.IsOnline).HasColumnName("is_online");
            entity.Property(x => x.OutageStartedAt).HasColumnName("outage_started_at");
            entity.Property(x => x.LastSuccessAt).HasColumnName("last_success_at");
            entity.Property(x => x.LastFailureAt).HasColumnName("last_failure_at");
            entity.Property(x => x.LastError).HasColumnName("last_error").HasColumnType("text");
            entity.Property(x => x.RedisBufferCount).HasColumnName("redis_buffer_count");
            entity.Property(x => x.DbSpilloverCount).HasColumnName("db_spillover_count");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<SystemSetting>(entity =>
        {
            entity.ToTable("system_settings");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.PressureUnitId).HasColumnName("pressure_unit_id");
            entity.Property(x => x.CycleTimeUnitId).HasColumnName("cycle_time_unit_id");
            entity.Property(x => x.BackupDbLocation).HasColumnName("backup_db_location").HasMaxLength(500);
            entity.Property(x => x.BackupSchedule).HasColumnName("backup_schedule").HasMaxLength(20).IsRequired();
            entity.Property(x => x.PlcIpAddress).HasColumnName("plc_ip_address").HasMaxLength(80);
            entity.Property(x => x.ElectricityRatePerKwh).HasColumnName("electricity_rate_per_kwh").HasPrecision(18, 2);
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasOne(x => x.PressureUnit).WithMany().HasForeignKey(x => x.PressureUnitId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.CycleTimeUnit).WithMany().HasForeignKey(x => x.CycleTimeUnitId).OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigurePowerTelemetry<T>(
        Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<T> entity,
        string table,
        bool uniqueDevice = true) where T : class
    {
        entity.ToTable(table);
        entity.HasKey("Id");
        entity.Property<long>("Id").HasColumnName("id");
        entity.Property<long>("DeviceId").HasColumnName("device_id");
        entity.Property<DateTime>("Timestamp").HasColumnName("timestamp");
        entity.Property<decimal?>("VoltageL1n").HasColumnName("voltage_l1n").HasPrecision(18, 6);
        entity.Property<decimal?>("VoltageL2n").HasColumnName("voltage_l2n").HasPrecision(18, 6);
        entity.Property<decimal?>("VoltageL3n").HasColumnName("voltage_l3n").HasPrecision(18, 6);
        entity.Property<decimal?>("VoltageL1l2").HasColumnName("voltage_l1l2").HasPrecision(18, 6);
        entity.Property<decimal?>("VoltageL2l3").HasColumnName("voltage_l2l3").HasPrecision(18, 6);
        entity.Property<decimal?>("VoltageL3l1").HasColumnName("voltage_l3l1").HasPrecision(18, 6);
        entity.Property<decimal?>("CurrentL1").HasColumnName("current_l1").HasPrecision(18, 6);
        entity.Property<decimal?>("CurrentL2").HasColumnName("current_l2").HasPrecision(18, 6);
        entity.Property<decimal?>("CurrentL3").HasColumnName("current_l3").HasPrecision(18, 6);
        entity.Property<decimal?>("CurrentNeutral").HasColumnName("current_neutral").HasPrecision(18, 6);
        entity.Property<decimal?>("ActivePowerKw").HasColumnName("active_power_kw").HasPrecision(18, 6);
        entity.Property<decimal?>("ReactivePowerKvar").HasColumnName("reactive_power_kvar").HasPrecision(18, 6);
        entity.Property<decimal?>("ApparentPowerKva").HasColumnName("apparent_power_kva").HasPrecision(18, 6);
        entity.Property<decimal?>("PowerFactor").HasColumnName("power_factor").HasPrecision(12, 6);
        entity.Property<decimal?>("FrequencyHz").HasColumnName("frequency_hz").HasPrecision(12, 6);
        entity.Property<decimal?>("EnergyImportKwh").HasColumnName("energy_import_kwh").HasPrecision(20, 6);
        entity.Property<decimal?>("EnergyExportKwh").HasColumnName("energy_export_kwh").HasPrecision(20, 6);
        entity.Property<DateTime>("ReceivedAt").HasColumnName("received_at");
        entity.Property<DateTime>("UpdatedAt").HasColumnName("updated_at");
        entity.HasIndex("DeviceId")
            .IsUnique(uniqueDevice)
            .HasDatabaseName(uniqueDevice ? "uq_power_latest_device_id" : $"ix_{table}_device_id");
        entity.HasIndex("Timestamp").HasDatabaseName($"ix_{table}_timestamp");
        entity.HasIndex("DeviceId", "Timestamp").HasDatabaseName($"ix_{table}_device_timestamp");
        if (!uniqueDevice)
        {
            entity.HasOne<PowerDevice>().WithMany().HasForeignKey("DeviceId").OnDelete(DeleteBehavior.Cascade);
        }
    }
}
