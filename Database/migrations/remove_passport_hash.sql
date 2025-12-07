-- Migration: Remove passport_hash column from users table
-- This migration removes the old passport code system in favor of QR-based login
-- DO NOT run this automatically - review and execute manually

ALTER TABLE users
DROP COLUMN passport_hash;

