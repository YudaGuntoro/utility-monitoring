-- Store the single application logo in system_settings. Maximum accepted upload is 1 MB.
USE `utility-system`;

SET @logo_data_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'logo_data');
SET @add_logo_data_sql := IF(@logo_data_exists = 0, 'ALTER TABLE system_settings ADD COLUMN logo_data LONGBLOB NULL AFTER electricity_rate_per_kwh', 'SELECT 1');
PREPARE add_logo_data_statement FROM @add_logo_data_sql;
EXECUTE add_logo_data_statement;
DEALLOCATE PREPARE add_logo_data_statement;

SET @logo_mime_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'logo_mime_type');
SET @add_logo_mime_sql := IF(@logo_mime_exists = 0, 'ALTER TABLE system_settings ADD COLUMN logo_mime_type VARCHAR(50) NULL AFTER logo_data', 'SELECT 1');
PREPARE add_logo_mime_statement FROM @add_logo_mime_sql;
EXECUTE add_logo_mime_statement;
DEALLOCATE PREPARE add_logo_mime_statement;
