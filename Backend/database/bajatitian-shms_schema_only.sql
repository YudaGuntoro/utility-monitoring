-- Utility Monitoring normalized schema.
-- Target: MySQL 8.0+

CREATE DATABASE IF NOT EXISTS `utility-system`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `utility-system`;

CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(30) NOT NULL,
    description VARCHAR(120) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_roles_role_name (role_name),
    CONSTRAINT ck_roles_is_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(80) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NULL,
    phone VARCHAR(50) NULL,
    roles_id INT NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    password_hash VARCHAR(255) NOT NULL,
    password_salt VARCHAR(255) NOT NULL,
    last_login_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email),
    KEY ix_users_roles_id (roles_id),
    CONSTRAINT fk_users_roles FOREIGN KEY (roles_id) REFERENCES roles (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT ck_users_is_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS measurement_units (
    id INT AUTO_INCREMENT PRIMARY KEY,
    unit_category VARCHAR(50) NOT NULL,
    unit_symbol VARCHAR(20) NOT NULL,
    unit_name VARCHAR(80) NOT NULL,
    is_deleted TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_measurement_units_category_symbol (unit_category, unit_symbol),
    CONSTRAINT ck_measurement_units_is_deleted CHECK (is_deleted IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS system_settings (
    id INT PRIMARY KEY,
    pressure_unit_id INT NOT NULL,
    cycle_time_unit_id INT NOT NULL,
    backup_db_location VARCHAR(500) NULL,
    backup_schedule VARCHAR(20) NOT NULL DEFAULT 'daily',
    plc_ip_address VARCHAR(80) NULL,
    electricity_rate_per_kwh DECIMAL(18,2) NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_system_settings_pressure_unit FOREIGN KEY (pressure_unit_id) REFERENCES measurement_units (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_system_settings_cycle_time_unit FOREIGN KEY (cycle_time_unit_id) REFERENCES measurement_units (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT ck_system_settings_backup_schedule CHECK (backup_schedule IN ('manual', 'hourly', 'daily', 'weekly', 'monthly'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shms_sites (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    site_code VARCHAR(50) NOT NULL,
    site_name VARCHAR(150) NOT NULL,
    owner_name VARCHAR(150) NULL,
    address_line VARCHAR(255) NULL,
    city VARCHAR(100) NULL,
    province VARCHAR(100) NULL,
    country_code CHAR(2) NOT NULL DEFAULT 'ID',
    latitude DECIMAL(10, 7) NULL,
    longitude DECIMAL(10, 7) NULL,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_shms_sites_site_code (site_code),
    KEY ix_shms_sites_location (latitude, longitude),
    CONSTRAINT ck_shms_sites_is_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS structural_assets (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    site_id BIGINT NOT NULL,
    asset_code VARCHAR(50) NOT NULL,
    asset_name VARCHAR(150) NOT NULL,
    asset_type VARCHAR(50) NOT NULL,
    design_life_years INT NULL,
    commissioned_at DATE NULL,
    description VARCHAR(500) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_structural_assets_site_asset_code (site_id, asset_code),
    KEY ix_structural_assets_site_id (site_id),
    CONSTRAINT fk_structural_assets_site FOREIGN KEY (site_id) REFERENCES shms_sites (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT ck_structural_assets_is_active CHECK (is_active IN (0, 1)),
    CONSTRAINT ck_structural_assets_design_life CHECK (design_life_years IS NULL OR design_life_years > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS asset_zones (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    asset_id BIGINT NOT NULL,
    zone_code VARCHAR(50) NOT NULL,
    zone_name VARCHAR(150) NOT NULL,
    description VARCHAR(500) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_asset_zones_asset_zone_code (asset_id, zone_code),
    KEY ix_asset_zones_asset_id (asset_id),
    CONSTRAINT fk_asset_zones_asset FOREIGN KEY (asset_id) REFERENCES structural_assets (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sensor_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sensor_code VARCHAR(20) NOT NULL,
    sensor_name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    default_unit_id INT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_sensor_types_sensor_code (sensor_code),
    KEY ix_sensor_types_default_unit_id (default_unit_id),
    CONSTRAINT fk_sensor_types_default_unit FOREIGN KEY (default_unit_id) REFERENCES measurement_units (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    CONSTRAINT ck_sensor_types_is_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sensor_devices (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    site_id BIGINT NOT NULL,
    asset_id BIGINT NULL,
    zone_id BIGINT NULL,
    sensor_type_id INT NOT NULL,
    device_code VARCHAR(80) NOT NULL,
    device_name VARCHAR(150) NOT NULL,
    serial_number VARCHAR(100) NULL,
    manufacturer VARCHAR(100) NULL,
    model_number VARCHAR(100) NULL,
    installed_at DATETIME(6) NULL,
    last_calibrated_at DATETIME(6) NULL,
    latitude DECIMAL(10, 7) NULL,
    longitude DECIMAL(10, 7) NULL,
    elevation_m DECIMAL(10, 3) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_sensor_devices_device_code (device_code),
    KEY ix_sensor_devices_site_id (site_id),
    KEY ix_sensor_devices_asset_id (asset_id),
    KEY ix_sensor_devices_zone_id (zone_id),
    KEY ix_sensor_devices_sensor_type_id (sensor_type_id),
    KEY ix_sensor_devices_status (status),
    CONSTRAINT fk_sensor_devices_site FOREIGN KEY (site_id) REFERENCES shms_sites (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_sensor_devices_asset FOREIGN KEY (asset_id) REFERENCES structural_assets (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    CONSTRAINT fk_sensor_devices_zone FOREIGN KEY (zone_id) REFERENCES asset_zones (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    CONSTRAINT fk_sensor_devices_sensor_type FOREIGN KEY (sensor_type_id) REFERENCES sensor_types (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT ck_sensor_devices_status CHECK (status IN ('active', 'inactive', 'maintenance', 'retired'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sensor_channels (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sensor_device_id BIGINT NOT NULL,
    unit_id INT NOT NULL,
    channel_code VARCHAR(80) NOT NULL,
    channel_name VARCHAR(150) NOT NULL,
    measurement_name VARCHAR(100) NOT NULL,
    axis VARCHAR(10) NULL,
    min_operating_value DECIMAL(18, 6) NULL,
    max_operating_value DECIMAL(18, 6) NULL,
    sampling_interval_seconds INT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_sensor_channels_device_channel_code (sensor_device_id, channel_code),
    KEY ix_sensor_channels_sensor_device_id (sensor_device_id),
    KEY ix_sensor_channels_unit_id (unit_id),
    KEY ix_sensor_channels_measurement_name (measurement_name),
    CONSTRAINT fk_sensor_channels_device FOREIGN KEY (sensor_device_id) REFERENCES sensor_devices (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_sensor_channels_unit FOREIGN KEY (unit_id) REFERENCES measurement_units (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT ck_sensor_channels_is_active CHECK (is_active IN (0, 1)),
    CONSTRAINT ck_sensor_channels_sampling CHECK (sampling_interval_seconds IS NULL OR sampling_interval_seconds > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mqtt_broker_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_name VARCHAR(100) NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INT NOT NULL DEFAULT 1883,
    client_id VARCHAR(100) NOT NULL,
    username VARCHAR(100) NULL,
    password_secret_name VARCHAR(150) NULL,
    use_tls TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_mqtt_broker_configs_config_name (config_name),
    CONSTRAINT ck_mqtt_broker_configs_port CHECK (port BETWEEN 1 AND 65535),
    CONSTRAINT ck_mqtt_broker_configs_use_tls CHECK (use_tls IN (0, 1)),
    CONSTRAINT ck_mqtt_broker_configs_is_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mqtt_sensor_topics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sensor_type_id INT NULL,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    topic VARCHAR(255) NOT NULL,
    qos INT NOT NULL DEFAULT 1,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_mqtt_sensor_topics_code (code),
    UNIQUE KEY uq_mqtt_sensor_topics_topic (topic),
    KEY ix_mqtt_sensor_topics_enabled (enabled),
    KEY ix_mqtt_sensor_topics_sensor_type_id (sensor_type_id),
    CONSTRAINT fk_mqtt_sensor_topics_sensor_type FOREIGN KEY (sensor_type_id) REFERENCES sensor_types (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    CONSTRAINT ck_mqtt_sensor_topics_qos CHECK (qos IN (0, 1, 2)),
    CONSTRAINT ck_mqtt_sensor_topics_enabled CHECK (enabled IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sensor_readings (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sensor_channel_id BIGINT NOT NULL,
    measured_at DATETIME(6) NOT NULL,
    numeric_value DECIMAL(20, 8) NOT NULL,
    quality_code VARCHAR(30) NOT NULL DEFAULT 'good',
    raw_payload JSON NULL,
    ingested_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_sensor_readings_channel_measured_at (sensor_channel_id, measured_at),
    KEY ix_sensor_readings_measured_at (measured_at),
    KEY ix_sensor_readings_quality_code (quality_code),
    CONSTRAINT fk_sensor_readings_channel FOREIGN KEY (sensor_channel_id) REFERENCES sensor_channels (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT ck_sensor_readings_quality_code CHECK (quality_code IN ('good', 'suspect', 'bad', 'missing'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS log_buffer (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sensor_device_id BIGINT NULL,
    device_id VARCHAR(100) NOT NULL,
    topic VARCHAR(255) NULL,
    payload LONGTEXT NOT NULL,
    time_stamp DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    retry_count INT NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    uploaded_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    KEY ix_log_buffer_time_stamp (time_stamp),
    KEY ix_log_buffer_status_time_stamp (status, time_stamp),
    KEY ix_log_buffer_device_time_stamp (device_id, time_stamp),
    KEY ix_log_buffer_sensor_device_id (sensor_device_id),
    CONSTRAINT fk_log_buffer_sensor_device FOREIGN KEY (sensor_device_id) REFERENCES sensor_devices (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    CONSTRAINT ck_log_buffer_status CHECK (status IN ('pending', 'uploaded', 'failed', 'ignored')),
    CONSTRAINT ck_log_buffer_retry_count CHECK (retry_count >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS alert_rules (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sensor_channel_id BIGINT NOT NULL,
    rule_code VARCHAR(80) NOT NULL,
    rule_name VARCHAR(150) NOT NULL,
    operator VARCHAR(20) NOT NULL,
    threshold_value DECIMAL(20, 8) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'warning',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_alert_rules_channel_rule_code (sensor_channel_id, rule_code),
    KEY ix_alert_rules_sensor_channel_id (sensor_channel_id),
    KEY ix_alert_rules_severity (severity),
    CONSTRAINT fk_alert_rules_channel FOREIGN KEY (sensor_channel_id) REFERENCES sensor_channels (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT ck_alert_rules_operator CHECK (operator IN ('>', '>=', '<', '<=', '=', '!=', 'between', 'outside')),
    CONSTRAINT ck_alert_rules_severity CHECK (severity IN ('info', 'warning', 'critical')),
    CONSTRAINT ck_alert_rules_is_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS alert_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    alert_rule_id BIGINT NOT NULL,
    sensor_reading_id BIGINT NULL,
    triggered_at DATETIME(6) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    message VARCHAR(500) NOT NULL,
    acknowledged_at DATETIME(6) NULL,
    acknowledged_by_user_id INT NULL,
    resolved_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    KEY ix_alert_events_triggered_at (triggered_at),
    KEY ix_alert_events_severity_triggered_at (severity, triggered_at),
    KEY ix_alert_events_alert_rule_id (alert_rule_id),
    KEY ix_alert_events_sensor_reading_id (sensor_reading_id),
    KEY ix_alert_events_acknowledged_by_user_id (acknowledged_by_user_id),
    CONSTRAINT fk_alert_events_rule FOREIGN KEY (alert_rule_id) REFERENCES alert_rules (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_alert_events_reading FOREIGN KEY (sensor_reading_id) REFERENCES sensor_readings (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    CONSTRAINT fk_alert_events_ack_user FOREIGN KEY (acknowledged_by_user_id) REFERENCES users (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    CONSTRAINT ck_alert_events_severity CHECK (severity IN ('info', 'warning', 'critical'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS server_sync_status (
    id INT PRIMARY KEY,
    server_name VARCHAR(100) NOT NULL,
    endpoint_url VARCHAR(500) NULL,
    is_online TINYINT(1) NOT NULL DEFAULT 0,
    outage_started_at DATETIME(6) NULL,
    last_success_at DATETIME(6) NULL,
    last_failure_at DATETIME(6) NULL,
    last_error TEXT NULL,
    redis_buffer_count BIGINT NOT NULL DEFAULT 0,
    db_spillover_count BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT ck_server_sync_status_is_online CHECK (is_online IN (0, 1)),
    CONSTRAINT ck_server_sync_status_redis_count CHECK (redis_buffer_count >= 0),
    CONSTRAINT ck_server_sync_status_spillover_count CHECK (db_spillover_count >= 0)
) ENGINE=InnoDB;
