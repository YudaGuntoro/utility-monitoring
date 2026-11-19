-- Upgrade existing Utility Monitoring databases to the normalized meter type catalog.
USE `utility-system`;

CREATE TABLE IF NOT EXISTS utility_types (
    code VARCHAR(20) NOT NULL PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    UNIQUE KEY uq_utility_types_name (name)
) ENGINE=InnoDB;

INSERT IGNORE INTO utility_types (code, name)
VALUES ('water', 'Water'), ('compressed-air', 'Compressed Air');

-- Existing Kind values are retained and must match one of the seeded catalog codes.
SET @has_utility_type_fk := (
    SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'utility_devices'
      AND CONSTRAINT_NAME = 'fk_utility_devices_type'
);
SET @add_utility_type_fk := IF(@has_utility_type_fk = 0,
    'ALTER TABLE utility_devices ADD CONSTRAINT fk_utility_devices_type FOREIGN KEY (Kind) REFERENCES utility_types(Code) ON UPDATE CASCADE ON DELETE RESTRICT',
    'SELECT 1');
PREPARE utility_type_fk_stmt FROM @add_utility_type_fk;
EXECUTE utility_type_fk_stmt;
DEALLOCATE PREPARE utility_type_fk_stmt;
