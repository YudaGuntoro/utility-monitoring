-- Utility Monitoring - 30 days dummy power telemetry.
-- Run after Backend/database/bajatitian-shms.sql:
-- mysql -u root -p utility-system < Backend/database/seed_power_dummy_30d.sql

SET SESSION cte_max_recursion_depth = 1000;

DELETE h
FROM power_telemetry_history h
JOIN power_devices d ON d.id = h.device_id
WHERE d.device_code LIKE 'PM-%';

INSERT INTO power_telemetry_history (
    device_id, timestamp,
    voltage_l1n, voltage_l2n, voltage_l3n,
    voltage_l1l2, voltage_l2l3, voltage_l3l1,
    current_l1, current_l2, current_l3, current_neutral,
    active_power_kw, reactive_power_kvar, apparent_power_kva,
    power_factor, frequency_hz,
    energy_import_kwh, energy_export_kwh,
    received_at, updated_at
)
WITH RECURSIVE seq AS (
    SELECT 0 AS n
    UNION ALL
    SELECT n + 1 FROM seq WHERE n < 719
), points AS (
    SELECT
        d.id AS device_id,
        d.device_code,
        DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-%d %H:00:00'), INTERVAL (719 - seq.n) HOUR) AS ts,
        seq.n,
        CASE d.device_code
            WHEN 'PM-01' THEN 38.0
            WHEN 'PM-02' THEN 31.5
            WHEN 'PM-03' THEN 27.0
            WHEN 'PM-04' THEN 24.0
            WHEN 'PM-05' THEN 21.0
            ELSE 18.0
        END AS base_kw,
        CASE d.device_code
            WHEN 'PM-01' THEN 12840.0
            WHEN 'PM-02' THEN 9820.0
            WHEN 'PM-03' THEN 7460.0
            WHEN 'PM-04' THEN 6120.0
            WHEN 'PM-05' THEN 4880.0
            ELSE 2500.0 + d.id * 25
        END AS base_energy
    FROM seq
    CROSS JOIN power_devices d
    WHERE d.device_code LIKE 'PM-%'
), shaped AS (
    SELECT
        device_id,
        device_code,
        ts,
        n,
        base_energy,
        GREATEST(5.0, base_kw + (SIN(n / 5.0) * 4.5) + (COS(n / 23.0) * 2.0) + IF(HOUR(ts) BETWEEN 8 AND 18, 6.0, -3.0)) AS kw
    FROM points
)
SELECT
    device_id,
    ts,
    226 + SIN(n / 7.0) * 4 + IF(device_code = 'PM-02', 1.4, 0),
    225 + COS(n / 8.0) * 4 + IF(device_code = 'PM-03', -1.1, 0),
    224 + SIN(n / 9.0) * 4 + IF(device_code = 'PM-01', 0.8, 0),
    391 + SIN(n / 7.0) * 6,
    390 + COS(n / 8.0) * 6,
    389 + SIN(n / 9.0) * 6,
    kw * 1000 / (1.732 * 400 * 0.92) + SIN(n / 3.0) * 2,
    kw * 1000 / (1.732 * 400 * 0.92) + COS(n / 4.0) * 2,
    kw * 1000 / (1.732 * 400 * 0.92) + SIN(n / 5.0) * 2,
    ABS(SIN(n / 6.0)) * 1.5,
    kw,
    kw * 0.32,
    kw / 0.92,
    0.90 + ABS(SIN(n / 17.0)) * 0.07,
    50 + SIN(n / 15.0) * 0.08,
    base_energy + SUM(kw) OVER (PARTITION BY device_id ORDER BY n ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),
    GREATEST(0, (base_energy + SUM(kw) OVER (PARTITION BY device_id ORDER BY n ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)) * 0.002),
    ts,
    NOW()
FROM shaped;

INSERT INTO power_latest_telemetry (
    device_id, timestamp,
    voltage_l1n, voltage_l2n, voltage_l3n,
    voltage_l1l2, voltage_l2l3, voltage_l3l1,
    current_l1, current_l2, current_l3, current_neutral,
    active_power_kw, reactive_power_kvar, apparent_power_kva,
    power_factor, frequency_hz,
    energy_import_kwh, energy_export_kwh,
    received_at, updated_at
)
SELECT
    h.device_id, h.timestamp,
    h.voltage_l1n, h.voltage_l2n, h.voltage_l3n,
    h.voltage_l1l2, h.voltage_l2l3, h.voltage_l3l1,
    h.current_l1, h.current_l2, h.current_l3, h.current_neutral,
    h.active_power_kw, h.reactive_power_kvar, h.apparent_power_kva,
    h.power_factor, h.frequency_hz,
    h.energy_import_kwh, h.energy_export_kwh,
    h.received_at, h.updated_at
FROM power_telemetry_history h
JOIN (
    SELECT device_id, MAX(timestamp) AS max_timestamp
    FROM power_telemetry_history
    GROUP BY device_id
) latest ON latest.device_id = h.device_id AND latest.max_timestamp = h.timestamp
ON DUPLICATE KEY UPDATE
    timestamp = VALUES(timestamp),
    voltage_l1n = VALUES(voltage_l1n),
    voltage_l2n = VALUES(voltage_l2n),
    voltage_l3n = VALUES(voltage_l3n),
    voltage_l1l2 = VALUES(voltage_l1l2),
    voltage_l2l3 = VALUES(voltage_l2l3),
    voltage_l3l1 = VALUES(voltage_l3l1),
    current_l1 = VALUES(current_l1),
    current_l2 = VALUES(current_l2),
    current_l3 = VALUES(current_l3),
    current_neutral = VALUES(current_neutral),
    active_power_kw = VALUES(active_power_kw),
    reactive_power_kvar = VALUES(reactive_power_kvar),
    apparent_power_kva = VALUES(apparent_power_kva),
    power_factor = VALUES(power_factor),
    frequency_hz = VALUES(frequency_hz),
    energy_import_kwh = VALUES(energy_import_kwh),
    energy_export_kwh = VALUES(energy_export_kwh),
    received_at = VALUES(received_at),
    updated_at = NOW();

UPDATE power_devices d
JOIN power_latest_telemetry l ON l.device_id = d.id
SET d.last_seen = l.timestamp,
    d.status = 'online',
    d.enabled = 1,
    d.updated_at = NOW();

