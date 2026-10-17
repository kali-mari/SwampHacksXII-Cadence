-- 1. Create Workouts Table to track individual sessions
CREATE TABLE workouts (
    session_id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'active' -- 'active', 'completed', 'synced_offline'
);

-- 2. Create Posture Data Table with all sensors and ML training label
CREATE TABLE postureData (
    logId BIGSERIAL PRIMARY KEY,
    sessionId INT REFERENCES workouts(session_id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Left Flex sensor
    leftFlexAngle DECIMAL(5, 1),
    
    -- Left Upper Arm IMU
    leftUpperAx DECIMAL(5, 2),
    leftUpperAy DECIMAL(5, 2),
    leftUpperAz DECIMAL(5, 2),
    leftUpperGx DECIMAL(6, 2),
    leftUpperGy DECIMAL(6, 2),
    leftUpperGz DECIMAL(6, 2),
    
    -- Left Forearm IMU
    leftForeAx DECIMAL(5, 2),
    leftForeAy DECIMAL(5, 2),
    leftForeAz DECIMAL(5, 2),
    leftForeGx DECIMAL(6, 2),
    leftForeGy DECIMAL(6, 2),
    leftForeGz DECIMAL(6, 2),
    
    -- Right Flex sensor
    rightFlexAngle DECIMAL(5, 1),
    
    -- Right Upper Arm IMU
    rightUpperAx DECIMAL(5, 2),
    rightUpperAy DECIMAL(5, 2),
    rightUpperAz DECIMAL(5, 2),
    rightUpperGx DECIMAL(6, 2),
    rightUpperGy DECIMAL(6, 2),
    rightUpperGz DECIMAL(6, 2),
    
    -- Right Forearm IMU
    rightForeAx DECIMAL(5, 2),
    rightForeAy DECIMAL(5, 2),
    rightForeAz DECIMAL(5, 2),
    rightForeGx DECIMAL(6, 2),
    rightForeGy DECIMAL(6, 2),
    rightForeGz DECIMAL(6, 2),
    
    -- Body temperature and humidity
    bodyTemp DECIMAL(4, 1),
    bodyHumidity INT,
    
    -- Outdoor temperature and humidity
    outdoorTemp DECIMAL(4, 1),
    outdoorHumidity INT,
    
    -- Machine Learning Training Labels
    is_good_form BOOLEAN      -- TRUE for good run/form, FALSE for bad run/form
);

-- 3. Create Index for fast time-series retrieval per session
CREATE INDEX idx_postureData_session_time ON postureData(sessionId, timestamp);