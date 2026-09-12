CREATE TABLE IF NOT EXISTS power_devices (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    model VARCHAR(150) NOT NULL DEFAULT 'Schneider PM8000 / PM8240',
    location VARCHAR(150) NULL,
    gateway_id VARCHAR(80) NULL,
    mqtt_topic VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'offline',
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    last_seen DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_power_devices_device_code (device_code),
    INDEX ix_power_devices_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS power_latest_telemetry (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id BIGINT NOT NULL,
    timestamp DATETIME(6) NOT NULL,
    voltage_l1n DECIMAL(18,6) NULL,
    voltage_l2n DECIMAL(18,6) NULL,
    voltage_l3n DECIMAL(18,6) NULL,
    voltage_l1l2 DECIMAL(18,6) NULL,
    voltage_l2l3 DECIMAL(18,6) NULL,
    voltage_l3l1 DECIMAL(18,6) NULL,
    current_l1 DECIMAL(18,6) NULL,
    current_l2 DECIMAL(18,6) NULL,
    current_l3 DECIMAL(18,6) NULL,
    current_neutral DECIMAL(18,6) NULL,
    active_power_kw DECIMAL(18,6) NULL,
    reactive_power_kvar DECIMAL(18,6) NULL,
    apparent_power_kva DECIMAL(18,6) NULL,
    power_factor DECIMAL(12,6) NULL,
    frequency_hz DECIMAL(12,6) NULL,
    energy_import_kwh DECIMAL(20,6) NULL,
    energy_export_kwh DECIMAL(20,6) NULL,
    received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_power_latest_device_id (device_id),
    INDEX ix_power_latest_telemetry_timestamp (timestamp),
    CONSTRAINT fk_power_latest_device FOREIGN KEY (device_id) REFERENCES power_devices(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS power_telemetry_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    device_id BIGINT NOT NULL,
    timestamp DATETIME(6) NOT NULL,
    voltage_l1n DECIMAL(18,6) NULL,
    voltage_l2n DECIMAL(18,6) NULL,
    voltage_l3n DECIMAL(18,6) NULL,
    voltage_l1l2 DECIMAL(18,6) NULL,
    voltage_l2l3 DECIMAL(18,6) NULL,
    voltage_l3l1 DECIMAL(18,6) NULL,
    current_l1 DECIMAL(18,6) NULL,
    current_l2 DECIMAL(18,6) NULL,
    current_l3 DECIMAL(18,6) NULL,
    current_neutral DECIMAL(18,6) NULL,
    active_power_kw DECIMAL(18,6) NULL,
    reactive_power_kvar DECIMAL(18,6) NULL,
    apparent_power_kva DECIMAL(18,6) NULL,
    power_factor DECIMAL(12,6) NULL,
    frequency_hz DECIMAL(12,6) NULL,
    energy_import_kwh DECIMAL(20,6) NULL,
    energy_export_kwh DECIMAL(20,6) NULL,
    received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    INDEX ix_power_telemetry_history_device_id (device_id),
    INDEX ix_power_telemetry_history_timestamp (timestamp),
    INDEX ix_power_telemetry_history_device_timestamp (device_id, timestamp),
    CONSTRAINT fk_power_history_device FOREIGN KEY (device_id) REFERENCES power_devices(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO power_devices (device_code, name, model, location, gateway_id, mqtt_topic, status, enabled)
SELECT seed.device_code, seed.name, seed.model, seed.location, seed.gateway_id, seed.mqtt_topic, seed.status, seed.enabled
FROM (
    SELECT 'PM-01' device_code, 'Main Panel 01' name, 'Schneider PM8000 / PM8240' model, 'Electrical Room' location, 'GW-01' gateway_id, 'utility/power/PM-01/telemetry' mqtt_topic, 'offline' status, 1 enabled
    UNION ALL SELECT 'PM-02', 'Main Panel 02', 'Schneider PM8000 / PM8240', 'Electrical Room', 'GW-01', 'utility/power/PM-02/telemetry', 'offline', 1
    UNION ALL SELECT 'PM-03', 'Main Panel 03', 'Schneider PM8000 / PM8240', 'Electrical Room', 'GW-01', 'utility/power/PM-03/telemetry', 'offline', 1
    UNION ALL SELECT 'PM-04', 'Main Panel 04', 'Schneider PM8000 / PM8240', 'Electrical Room', 'GW-01', 'utility/power/PM-04/telemetry', 'offline', 1
    UNION ALL SELECT 'PM-05', 'Main Panel 05', 'Schneider PM8000 / PM8240', 'Electrical Room', 'GW-01', 'utility/power/PM-05/telemetry', 'offline', 1
) seed
WHERE NOT EXISTS (SELECT 1 FROM power_devices);
