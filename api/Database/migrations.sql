-- Migration: Add classification column and create admin user
-- Run this after schema.sql

-- Add classification column if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS classification ENUM('user', 'admin') DEFAULT 'user';

-- Make password_hash nullable (for admin users)
ALTER TABLE users 
MODIFY COLUMN password_hash VARCHAR(255) NULL;

-- Create admin user (Whitney)
-- Only insert if email doesn't already exist
INSERT INTO users (email, password_hash, is_verified, classification)
SELECT 'whitney@email.com', NULL, TRUE, 'admin'
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE email = 'whitney@email.com'
);

