CREATE TABLE IF NOT EXISTS mqtt_sensor_topics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    topic VARCHAR(255) NOT NULL,
    qos INT NOT NULL DEFAULT 1,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_mqtt_sensor_topics_code (code),
    INDEX ix_mqtt_sensor_topics_enabled (enabled)
);

INSERT INTO mqtt_sensor_topics
    (code, name, topic, qos, enabled)
VALUES
    ('TILT', 'Tilt Sensor', 'utility/tilt', 1, 1),
    ('VW', 'Vibrating Wire Sensor', 'utility/vw', 1, 1),
    ('ATRH', 'Air Temperature & RH Sensor', 'utility/atrh', 1, 1),
    ('ACC', 'Accelerometer Sensor', 'utility/acc', 1, 1)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    topic = VALUES(topic),
    qos = VALUES(qos),
    updated_at = CURRENT_TIMESTAMP;
