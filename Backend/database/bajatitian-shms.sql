-- Utility Monitoring database bootstrap with normalized starter data.
-- Run from repository root:
-- mysql -u root -p -e "source Backend/database/bajatitian-shms.sql"

SOURCE Backend/database/bajatitian-shms_schema_only.sql;

USE `utility-system`;

SET @has_mqtt_sensor_type_id := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'mqtt_sensor_topics'
      AND COLUMN_NAME = 'sensor_type_id'
);
SET @sql := IF(@has_mqtt_sensor_type_id = 0,
    'ALTER TABLE mqtt_sensor_topics ADD COLUMN sensor_type_id INT NULL AFTER id',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_log_sensor_device_id := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'log_buffer'
      AND COLUMN_NAME = 'sensor_device_id'
);
SET @sql := IF(@has_log_sensor_device_id = 0,
    'ALTER TABLE log_buffer ADD COLUMN sensor_device_id BIGINT NULL AFTER id',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO roles
    (id, role_name, description, is_active)
VALUES
    (1, 'ADMIN', 'Administrator', 1),
    (2, 'SUPERVISOR', 'Supervisor', 1),
    (3, 'OPERATOR', 'Operator', 1),
    (4, 'VIEWER', 'Viewer', 1)
ON DUPLICATE KEY UPDATE
    role_name = VALUES(role_name),
    description = VALUES(description),
    is_active = VALUES(is_active);

-- Default login: root / root_native
INSERT INTO users
    (id, username, full_name, email, roles_id, is_active, password_hash, password_salt)
VALUES
    (1, 'admin', 'SHMS Administrator', 'admin@shms.local', 1, 1,
     'mV/QhZOhh7mvmWj0P1RgeXm3hZB1AkKHY5jfEcrC7PE=', 'Y21tcy1hZG1pbi1zYWx0LXYx'),
    (2, 'root', 'SHMS Root', 'root@shms.local', 1, 1,
     'QzApLclLs39Wg6pGId5HXwbyiH5QdA41S8X40bj4Mm4=', 'eWFubWFyLXJvb3QtdjEhIQ==')
ON DUPLICATE KEY UPDATE
    full_name = VALUES(full_name),
    email = VALUES(email),
    roles_id = VALUES(roles_id),
    is_active = VALUES(is_active);

INSERT INTO measurement_units
    (unit_category, unit_symbol, unit_name, is_deleted)
VALUES
    ('pressure', 'MPa', 'Megapascal', 0),
    ('cycle_time', 's', 'Second', 0),
    ('angle', 'deg', 'Degree', 0),
    ('frequency', 'Hz', 'Hertz', 0),
    ('temperature', 'C', 'Celsius', 0),
    ('humidity', '%RH', 'Relative Humidity', 0),
    ('acceleration', 'g', 'Gravity Acceleration', 0),
    ('displacement', 'mm', 'Millimeter', 0)
ON DUPLICATE KEY UPDATE
    unit_name = VALUES(unit_name),
    is_deleted = VALUES(is_deleted),
    updated_at = CURRENT_TIMESTAMP(6);

INSERT INTO system_settings
    (id, pressure_unit_id, cycle_time_unit_id, backup_schedule, electricity_rate_per_kwh)
SELECT
    1,
    pressure.id,
    cycle_time.id,
    'daily',
    0
FROM measurement_units pressure
CROSS JOIN measurement_units cycle_time
WHERE pressure.unit_category = 'pressure'
  AND pressure.unit_symbol = 'MPa'
  AND cycle_time.unit_category = 'cycle_time'
  AND cycle_time.unit_symbol = 's'
ON DUPLICATE KEY UPDATE
    id = system_settings.id;

INSERT INTO shms_sites
    (id, site_code, site_name, owner_name, address_line, city, province, country_code, latitude, longitude, timezone, is_active)
VALUES
    (1, 'BTU-SITE-001', 'Baja Titian Utama Monitoring Site', 'PT. Baja Titian Utama', 'Bridge monitoring demo area', 'Palangka Raya', 'Kalimantan Tengah', 'ID', -2.2096000, 113.9213000, 'Asia/Jakarta', 1)
ON DUPLICATE KEY UPDATE
    site_name = VALUES(site_name),
    owner_name = VALUES(owner_name),
    address_line = VALUES(address_line),
    city = VALUES(city),
    province = VALUES(province),
    latitude = VALUES(latitude),
    longitude = VALUES(longitude),
    timezone = VALUES(timezone),
    is_active = VALUES(is_active);

INSERT INTO structural_assets
    (id, site_id, asset_code, asset_name, asset_type, design_life_years, commissioned_at, description, is_active)
VALUES
    (1, 1, 'BRG-KM-012', 'Bridge KM 12', 'bridge', 50, '2026-01-01', 'Primary bridge asset for SHMS demonstration', 1)
ON DUPLICATE KEY UPDATE
    asset_name = VALUES(asset_name),
    asset_type = VALUES(asset_type),
    design_life_years = VALUES(design_life_years),
    commissioned_at = VALUES(commissioned_at),
    description = VALUES(description),
    is_active = VALUES(is_active);

INSERT INTO asset_zones
    (id, asset_id, zone_code, zone_name, description)
VALUES
    (1, 1, 'P1', 'Pier 1', 'North pier monitoring zone'),
    (2, 1, 'P2', 'Pier 2', 'South pier monitoring zone'),
    (3, 1, 'DECK', 'Bridge Deck', 'Main deck monitoring zone')
ON DUPLICATE KEY UPDATE
    zone_name = VALUES(zone_name),
    description = VALUES(description);

INSERT INTO sensor_types
    (id, sensor_code, sensor_name, description, default_unit_id, is_active)
SELECT 1, 'TILT', 'Tilt Sensor', 'Measures structural inclination', id, 1
FROM measurement_units WHERE unit_category = 'angle' AND unit_symbol = 'deg'
ON DUPLICATE KEY UPDATE sensor_name = VALUES(sensor_name), description = VALUES(description), default_unit_id = VALUES(default_unit_id), is_active = VALUES(is_active);

INSERT INTO sensor_types
    (id, sensor_code, sensor_name, description, default_unit_id, is_active)
SELECT 2, 'VW', 'Vibrating Wire Sensor', 'Measures vibrating wire frequency', id, 1
FROM measurement_units WHERE unit_category = 'frequency' AND unit_symbol = 'Hz'
ON DUPLICATE KEY UPDATE sensor_name = VALUES(sensor_name), description = VALUES(description), default_unit_id = VALUES(default_unit_id), is_active = VALUES(is_active);

INSERT INTO sensor_types
    (id, sensor_code, sensor_name, description, default_unit_id, is_active)
SELECT 3, 'ATRH', 'Air Temperature & RH Sensor', 'Measures temperature and relative humidity', id, 1
FROM measurement_units WHERE unit_category = 'temperature' AND unit_symbol = 'C'
ON DUPLICATE KEY UPDATE sensor_name = VALUES(sensor_name), description = VALUES(description), default_unit_id = VALUES(default_unit_id), is_active = VALUES(is_active);

INSERT INTO sensor_types
    (id, sensor_code, sensor_name, description, default_unit_id, is_active)
SELECT 4, 'ACC', 'Accelerometer Sensor', 'Measures acceleration on three axes', id, 1
FROM measurement_units WHERE unit_category = 'acceleration' AND unit_symbol = 'g'
ON DUPLICATE KEY UPDATE sensor_name = VALUES(sensor_name), description = VALUES(description), default_unit_id = VALUES(default_unit_id), is_active = VALUES(is_active);

INSERT INTO sensor_devices
    (id, site_id, asset_id, zone_id, sensor_type_id, device_code, device_name, serial_number, manufacturer, model_number, installed_at, latitude, longitude, elevation_m, status)
VALUES
    (1, 1, 1, 1, 1, 'SHMS-TILT-01', 'Tilt Sensor Pier 1', 'TILT-0001', 'Generic', 'TILT-X1', '2026-09-09 08:00:00', -2.2096000, 113.9213000, 14.250, 'active'),
    (2, 1, 1, 2, 2, 'SHMS-VW-01', 'Vibrating Wire Pier 2', 'VW-0001', 'Generic', 'VW-X1', '2026-09-09 08:00:00', -2.2098000, 113.9215000, 13.800, 'active'),
    (3, 1, 1, 3, 3, 'SHMS-ATRH-01', 'Temperature RH Deck', 'ATRH-0001', 'Generic', 'ATRH-X1', '2026-09-09 08:00:00', -2.2097000, 113.9214000, 15.100, 'active'),
    (4, 1, 1, 3, 4, 'SHMS-ACC-01', 'Accelerometer Deck', 'ACC-0001', 'Generic', 'ACC-X1', '2026-09-09 08:00:00', -2.2097000, 113.9214000, 15.150, 'active')
ON DUPLICATE KEY UPDATE
    device_name = VALUES(device_name),
    site_id = VALUES(site_id),
    asset_id = VALUES(asset_id),
    zone_id = VALUES(zone_id),
    sensor_type_id = VALUES(sensor_type_id),
    status = VALUES(status);

INSERT INTO sensor_channels
    (id, sensor_device_id, unit_id, channel_code, channel_name, measurement_name, axis, min_operating_value, max_operating_value, sampling_interval_seconds, is_active)
SELECT 1, 1, id, 'TILT-X', 'Tilt X Axis', 'tilt', 'X', -5.000000, 5.000000, 60, 1 FROM measurement_units WHERE unit_category = 'angle' AND unit_symbol = 'deg'
ON DUPLICATE KEY UPDATE channel_name = VALUES(channel_name), measurement_name = VALUES(measurement_name), is_active = VALUES(is_active);

INSERT INTO sensor_channels
    (id, sensor_device_id, unit_id, channel_code, channel_name, measurement_name, axis, min_operating_value, max_operating_value, sampling_interval_seconds, is_active)
SELECT 2, 2, id, 'VW-FREQ', 'Vibrating Wire Frequency', 'frequency', NULL, 1000.000000, 1800.000000, 60, 1 FROM measurement_units WHERE unit_category = 'frequency' AND unit_symbol = 'Hz'
ON DUPLICATE KEY UPDATE channel_name = VALUES(channel_name), measurement_name = VALUES(measurement_name), is_active = VALUES(is_active);

INSERT INTO sensor_channels
    (id, sensor_device_id, unit_id, channel_code, channel_name, measurement_name, axis, min_operating_value, max_operating_value, sampling_interval_seconds, is_active)
SELECT 3, 3, id, 'AIR-TEMP', 'Air Temperature', 'temperature', NULL, -10.000000, 60.000000, 60, 1 FROM measurement_units WHERE unit_category = 'temperature' AND unit_symbol = 'C'
ON DUPLICATE KEY UPDATE channel_name = VALUES(channel_name), measurement_name = VALUES(measurement_name), is_active = VALUES(is_active);

INSERT INTO sensor_channels
    (id, sensor_device_id, unit_id, channel_code, channel_name, measurement_name, axis, min_operating_value, max_operating_value, sampling_interval_seconds, is_active)
SELECT 4, 3, id, 'AIR-RH', 'Relative Humidity', 'humidity', NULL, 0.000000, 100.000000, 60, 1 FROM measurement_units WHERE unit_category = 'humidity' AND unit_symbol = '%RH'
ON DUPLICATE KEY UPDATE channel_name = VALUES(channel_name), measurement_name = VALUES(measurement_name), is_active = VALUES(is_active);

INSERT INTO sensor_channels
    (id, sensor_device_id, unit_id, channel_code, channel_name, measurement_name, axis, min_operating_value, max_operating_value, sampling_interval_seconds, is_active)
SELECT 5, 4, id, 'ACC-Z', 'Acceleration Z Axis', 'acceleration', 'Z', -2.000000, 2.000000, 10, 1 FROM measurement_units WHERE unit_category = 'acceleration' AND unit_symbol = 'g'
ON DUPLICATE KEY UPDATE channel_name = VALUES(channel_name), measurement_name = VALUES(measurement_name), is_active = VALUES(is_active);

INSERT INTO mqtt_broker_configs
    (id, config_name, host, port, client_id, use_tls, is_active)
VALUES
    (1, 'default', 'broker.emqx.io', 1883, 'SHMSClient', 0, 1)
ON DUPLICATE KEY UPDATE
    host = VALUES(host),
    port = VALUES(port),
    client_id = VALUES(client_id),
    use_tls = VALUES(use_tls),
    is_active = VALUES(is_active);

INSERT INTO mqtt_sensor_topics
    (sensor_type_id, code, name, topic, qos, enabled)
SELECT id, 'TILT', 'Tilt Sensor', 'shms/tilt', 1, 1 FROM sensor_types WHERE sensor_code = 'TILT'
ON DUPLICATE KEY UPDATE sensor_type_id = VALUES(sensor_type_id), name = VALUES(name), topic = VALUES(topic), qos = VALUES(qos), enabled = VALUES(enabled);

INSERT INTO mqtt_sensor_topics
    (sensor_type_id, code, name, topic, qos, enabled)
SELECT id, 'VW', 'Vibrating Wire Sensor', 'shms/vw', 1, 1 FROM sensor_types WHERE sensor_code = 'VW'
ON DUPLICATE KEY UPDATE sensor_type_id = VALUES(sensor_type_id), name = VALUES(name), topic = VALUES(topic), qos = VALUES(qos), enabled = VALUES(enabled);

INSERT INTO mqtt_sensor_topics
    (sensor_type_id, code, name, topic, qos, enabled)
SELECT id, 'ATRH', 'Air Temperature & RH Sensor', 'shms/atrh', 1, 1 FROM sensor_types WHERE sensor_code = 'ATRH'
ON DUPLICATE KEY UPDATE sensor_type_id = VALUES(sensor_type_id), name = VALUES(name), topic = VALUES(topic), qos = VALUES(qos), enabled = VALUES(enabled);

INSERT INTO mqtt_sensor_topics
    (sensor_type_id, code, name, topic, qos, enabled)
SELECT id, 'ACC', 'Accelerometer Sensor', 'shms/acc', 1, 1 FROM sensor_types WHERE sensor_code = 'ACC'
ON DUPLICATE KEY UPDATE sensor_type_id = VALUES(sensor_type_id), name = VALUES(name), topic = VALUES(topic), qos = VALUES(qos), enabled = VALUES(enabled);

INSERT INTO sensor_readings
    (sensor_channel_id, measured_at, numeric_value, quality_code, raw_payload)
VALUES
    (1, '2026-09-09 08:00:00.000000', 0.14000000, 'good', JSON_OBJECT('sensor', 'TILT', 'axis', 'X', 'value', 0.14)),
    (2, '2026-09-09 08:00:00.000000', 1284.50000000, 'good', JSON_OBJECT('sensor', 'VW', 'value', 1284.5)),
    (3, '2026-09-09 08:00:00.000000', 31.20000000, 'good', JSON_OBJECT('sensor', 'ATRH', 'temperature', 31.2)),
    (4, '2026-09-09 08:00:00.000000', 68.50000000, 'good', JSON_OBJECT('sensor', 'ATRH', 'humidity', 68.5)),
    (5, '2026-09-09 08:00:00.000000', 1.02000000, 'good', JSON_OBJECT('sensor', 'ACC', 'axis', 'Z', 'value', 1.02))
ON DUPLICATE KEY UPDATE
    numeric_value = VALUES(numeric_value),
    quality_code = VALUES(quality_code),
    raw_payload = VALUES(raw_payload);

INSERT INTO log_buffer
    (sensor_device_id, device_id, topic, payload, time_stamp, status, retry_count, uploaded_at, created_at)
SELECT
    devices.id,
    seed.device_id,
    seed.topic,
    seed.payload,
    seed.time_stamp,
    seed.status,
    seed.retry_count,
    seed.uploaded_at,
    seed.created_at
FROM (
    SELECT 'SHMS-TILT-01' device_id, 'shms/tilt' topic, '{"sensor":"TILT","value":0.14,"unit":"deg"}' payload, '2026-09-09 08:00:00.000000' time_stamp, 'uploaded' status, 0 retry_count, '2026-09-09 08:00:05.000000' uploaded_at, '2026-09-09 08:00:00.000000' created_at
    UNION ALL SELECT 'SHMS-VW-01', 'shms/vw', '{"sensor":"VW","value":1284.5,"unit":"Hz"}', '2026-09-09 08:00:00.000000', 'uploaded', 0, '2026-09-09 08:00:05.000000', '2026-09-09 08:00:00.000000'
    UNION ALL SELECT 'SHMS-ATRH-01', 'shms/atrh', '{"sensor":"ATRH","temperature":31.2,"humidity":68.5}', '2026-09-09 08:00:00.000000', 'pending', 1, NULL, '2026-09-09 08:00:00.000000'
    UNION ALL SELECT 'SHMS-ACC-01', 'shms/acc', '{"sensor":"ACC","x":0.01,"y":0.03,"z":1.02}', '2026-09-09 08:00:00.000000', 'failed', 3, NULL, '2026-09-09 08:00:00.000000'
) seed
LEFT JOIN sensor_devices devices ON devices.device_code = seed.device_id
WHERE NOT EXISTS (
    SELECT 1
    FROM log_buffer existing
    WHERE existing.device_id = seed.device_id
      AND existing.topic = seed.topic
      AND existing.time_stamp = seed.time_stamp
);

INSERT INTO alert_rules
    (id, sensor_channel_id, rule_code, rule_name, operator, threshold_value, severity, is_active)
VALUES
    (1, 1, 'TILT-X-WARN', 'Tilt X warning threshold', '>=', 2.00000000, 'warning', 1),
    (2, 1, 'TILT-X-CRIT', 'Tilt X critical threshold', '>=', 3.00000000, 'critical', 1),
    (3, 5, 'ACC-Z-WARN', 'Acceleration Z warning threshold', '>=', 1.50000000, 'warning', 1)
ON DUPLICATE KEY UPDATE
    rule_name = VALUES(rule_name),
    operator = VALUES(operator),
    threshold_value = VALUES(threshold_value),
    severity = VALUES(severity),
    is_active = VALUES(is_active);

UPDATE log_buffer log
JOIN sensor_devices devices ON devices.device_code = log.device_id
SET log.sensor_device_id = devices.id
WHERE log.sensor_device_id IS NULL;

INSERT INTO server_sync_status
    (id, server_name, endpoint_url, is_online, redis_buffer_count, db_spillover_count)
VALUES
    (1, 'Witon Server', NULL, 0, 0, 0)
ON DUPLICATE KEY UPDATE
    server_name = VALUES(server_name);

SOURCE Backend/Web.API.Persistence/Migrations/20260912_001_power_monitoring.sql;
