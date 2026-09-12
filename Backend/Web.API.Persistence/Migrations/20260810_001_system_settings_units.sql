-- Utility Monitoring - global system settings and unit master data.

CREATE TABLE IF NOT EXISTS measurement_units (
    id INT AUTO_INCREMENT PRIMARY KEY,
    unit_category VARCHAR(50) NOT NULL,
    unit_symbol VARCHAR(20) NOT NULL,
    unit_name VARCHAR(80) NOT NULL,
    is_deleted TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_measurement_units_category_symbol (unit_category, unit_symbol)
);

INSERT INTO measurement_units
    (unit_category, unit_symbol, unit_name, is_deleted)
VALUES
    ('pressure', 'MPa', 'Megapascal', 0),
    ('cycle_time', 's', 'Second', 0)
ON DUPLICATE KEY UPDATE
    unit_name = VALUES(unit_name),
    is_deleted = VALUES(is_deleted),
    updated_at = CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS system_settings (
    id INT PRIMARY KEY,
    pressure_unit_id INT NOT NULL,
    cycle_time_unit_id INT NOT NULL,
    backup_db_location VARCHAR(500) NULL,
    backup_schedule VARCHAR(20) NOT NULL DEFAULT 'daily',
    plc_ip_address VARCHAR(80) NULL,
    electricity_rate_per_kwh DECIMAL(18,2) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_system_settings_pressure_unit
        FOREIGN KEY (pressure_unit_id) REFERENCES measurement_units (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_system_settings_cycle_time_unit
        FOREIGN KEY (cycle_time_unit_id) REFERENCES measurement_units (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

INSERT INTO system_settings
    (id, pressure_unit_id, cycle_time_unit_id, backup_schedule)
SELECT
    1,
    pressure.id,
    cycle_time.id,
    'daily'
FROM measurement_units pressure
CROSS JOIN measurement_units cycle_time
WHERE pressure.unit_category = 'pressure'
  AND pressure.unit_symbol = 'MPa'
  AND cycle_time.unit_category = 'cycle_time'
  AND cycle_time.unit_symbol = 's'
ON DUPLICATE KEY UPDATE
    id = id;

SET @plc_ip_column_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'system_settings'
      AND COLUMN_NAME = 'plc_ip_address'
);
SET @add_plc_ip_sql := IF(
    @plc_ip_column_exists = 0,
    'ALTER TABLE system_settings ADD COLUMN plc_ip_address VARCHAR(80) NULL AFTER backup_schedule',
    'SELECT 1'
);
PREPARE add_plc_ip_statement FROM @add_plc_ip_sql;
EXECUTE add_plc_ip_statement;
DEALLOCATE PREPARE add_plc_ip_statement;

SET @electricity_rate_column_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'system_settings'
      AND COLUMN_NAME = 'electricity_rate_per_kwh'
);
SET @add_electricity_rate_sql := IF(
    @electricity_rate_column_exists = 0,
    'ALTER TABLE system_settings ADD COLUMN electricity_rate_per_kwh DECIMAL(18,2) NOT NULL DEFAULT 0 AFTER plc_ip_address',
    'SELECT 1'
);
PREPARE add_electricity_rate_statement FROM @add_electricity_rate_sql;
EXECUTE add_electricity_rate_statement;
DEALLOCATE PREPARE add_electricity_rate_statement;
