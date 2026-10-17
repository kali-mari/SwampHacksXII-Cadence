-- 1. Create Workouts Table
CREATE TABLE workouts (
    session_id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'active'
);

-- 2. Create Posture Data Table
CREATE TABLE postureData (
    logId BIGSERIAL PRIMARY KEY,
    sessionId INT REFERENCES workouts(session_id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    leftFlexAngle DECIMAL(5, 1),
    leftUpperAx DECIMAL(5, 2),
    leftUpperAy DECIMAL(5, 2),
    leftUpperAz DECIMAL(5, 2),
    leftUpperGx DECIMAL(6, 2),
    leftUpperGy DECIMAL(6, 2),
    leftUpperGz DECIMAL(6, 2),
    leftForeAx DECIMAL(5, 2),
    leftForeAy DECIMAL(5, 2),
    leftForeAz DECIMAL(5, 2),
    leftForeGx DECIMAL(6, 2),
    leftForeGy DECIMAL(6, 2),
    leftForeGz DECIMAL(6, 2),
    rightFlexAngle DECIMAL(5, 1),
    rightUpperAx DECIMAL(5, 2),
    rightUpperAy DECIMAL(5, 2),
    rightUpperAz DECIMAL(5, 2),
    rightUpperGx DECIMAL(6, 2),
    rightUpperGy DECIMAL(6, 2),
    rightUpperGz DECIMAL(6, 2),
    rightForeAx DECIMAL(5, 2),
    rightForeAy DECIMAL(5, 2),
    rightForeAz DECIMAL(5, 2),
    rightForeGx DECIMAL(6, 2),
    rightForeGy DECIMAL(6, 2),
    rightForeGz DECIMAL(6, 2),
    bodyTemp DECIMAL(4, 1),
    bodyHumidity INT,
    outdoorTemp DECIMAL(4, 1),
    outdoorHumidity INT
);

CREATE INDEX idx_postureData_session_time ON postureData(sessionId, timestamp);