# Admin User Setup Instructions

## Database Migration

To add the classification column and create the admin user, run the migration SQL:

```sql
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
```

## Admin Login

1. Go to the login/verification page (index.html)
2. Use the "Admin Login" section
3. Enter email: `whitney@email.com`
4. Click "Login as Admin"
5. You will be redirected to the admin portal

## Features

- **Admin Classification**: Users are classified as either 'user' or 'admin'
- **Admin Portal Access**: Only users with classification='admin' can access admin.html
- **Dashboard View**: Admins can view the user dashboard from the admin portal
- **Auto-Routing**: Login automatically routes admins to admin portal, users to dashboard

## Security Notes

- Admin users have NULL password_hash (they use email-based login)
- Admin accounts must be is_verified=TRUE to login
- Admin portal checks classification on page load
- Non-admin users are redirected if they try to access admin portal

