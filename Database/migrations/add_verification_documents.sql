-- Migration: Add verification_documents table for document storage and analysis
-- Run this after schema.sql

CREATE TABLE IF NOT EXISTS verification_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    verification_id INT NOT NULL,
    user_id INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    id_type VARCHAR(50),
    extracted_data JSON,
    id_analysis_result JSON,
    analysis_result JSON,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (verification_id) REFERENCES pending_verifications(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_verification_id (verification_id),
    INDEX idx_user_id (user_id)
);

