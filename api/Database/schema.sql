-- =========================================================
-- Users Table
-- Stores basic auth, MFA, verification state, QR passport
-- =========================================================

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),                  -- NULL for admin users using passport login
    mfa_secret VARCHAR(255),                    -- for OTP codes
    is_verified BOOLEAN DEFAULT FALSE,          -- passed verification
    requires_review BOOLEAN DEFAULT FALSE,      -- flagged → Whitney review
    passport_hash VARCHAR(255),                 -- unique hashed ID for QR
    classification ENUM('user', 'admin') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- Pending Verifications
-- Tracks flagged users requiring Whitney approval
-- =========================================================

CREATE TABLE pending_verifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    reason TEXT,                                -- why they were flagged
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);


-- =========================================================
-- Alerts Raw (NVD Intake)
-- Stores raw CVE JSON pulled from NVD
-- =========================================================

CREATE TABLE alerts_raw (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cve_id VARCHAR(50) NOT NULL,
    raw_json JSON NOT NULL,
    ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- Alerts Scored (Processed + Prioritized)
-- Stores useful fields for triage + dashboards
-- =========================================================

CREATE TABLE alerts_scored (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cve_id VARCHAR(50) NOT NULL,
    description TEXT,
    cvss_score FLOAT,
    bio_relevance_score FLOAT,
    risk_score FLOAT,
    trust_score FLOAT,
    tier ENUM('green', 'yellow', 'red') DEFAULT 'green',
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- Audit Logs
-- Tracks critical actions (admin approvals, escalations, etc.)
-- =========================================================

CREATE TABLE audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,                             -- user performing action
    action VARCHAR(255) NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
