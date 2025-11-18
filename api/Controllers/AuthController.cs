using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Security.Cryptography;
using System.Text;

namespace MIS321_GroupProject3_Team2.Controllers
{
    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        private readonly string _connectionString;

        public AuthController(IConfiguration configuration)
        {
            var configConn = configuration.GetConnectionString("DefaultConnection");
            // Handle literal "${JAWSDB_URL}" string from appsettings.json
            if (string.IsNullOrEmpty(configConn) || configConn == "${JAWSDB_URL}")
            {
                configConn = null;
            }
            _connectionString = configConn 
                ?? Environment.GetEnvironmentVariable("JAWSDB_URL") 
                ?? "mysql://rafzxyujgowd9c4f:u40pss81sz1ub6t8@durvbryvdw2sjcm5.cbetxkdyhwsb.us-east-1.rds.amazonaws.com:3306/p14kvqervonda4dv";
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest request)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                // Check if email already exists
                using var checkCmd = new MySqlCommand(
                    "SELECT COUNT(*) FROM users WHERE email = @email",
                    connection);
                checkCmd.Parameters.AddWithValue("@email", request.Email);
                
                if (Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0)
                {
                    return BadRequest(new { message = "Email already registered" });
                }

                // Hash password
                var passwordHash = HashPassword(request.Password);

                // Generate MFA secret (simple 4-digit code for now)
                var mfaSecret = GenerateMFASecret();

                // Insert user
                using var insertCmd = new MySqlCommand(
                    "INSERT INTO users (email, password_hash, mfa_secret, is_verified, requires_review) VALUES (@email, @password_hash, @mfa_secret, @is_verified, @requires_review)",
                    connection);
                insertCmd.Parameters.AddWithValue("@email", request.Email);
                insertCmd.Parameters.AddWithValue("@password_hash", passwordHash);
                insertCmd.Parameters.AddWithValue("@mfa_secret", mfaSecret);
                insertCmd.Parameters.AddWithValue("@is_verified", false);
                insertCmd.Parameters.AddWithValue("@requires_review", false);
                
                await insertCmd.ExecuteNonQueryAsync();
                var userId = (int)insertCmd.LastInsertedId;

                return Ok(new { 
                    id = userId, 
                    email = request.Email,
                    mfaSecret = mfaSecret // In production, send via email/SMS
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpPost("mfa/send")]
        public async Task<IActionResult> SendMFACode([FromBody] SendMFARequest request)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                // Get user
                using var userCmd = new MySqlCommand(
                    "SELECT id, mfa_secret FROM users WHERE email = @email",
                    connection);
                userCmd.Parameters.AddWithValue("@email", request.Email);
                
                using var reader = await userCmd.ExecuteReaderAsync();
                if (!reader.Read())
                {
                    return NotFound(new { message = "User not found" });
                }

                var userId = reader.GetInt32("id");
                var mfaSecret = reader.GetString("mfa_secret");
                
                // Generate new code
                var code = GenerateMFACode();
                
                // Update MFA secret with new code
                reader.Close();
                using var updateCmd = new MySqlCommand(
                    "UPDATE users SET mfa_secret = @mfa_secret WHERE id = @id",
                    connection);
                updateCmd.Parameters.AddWithValue("@mfa_secret", code);
                updateCmd.Parameters.AddWithValue("@id", userId);
                await updateCmd.ExecuteNonQueryAsync();

                // In production, send code via email/SMS
                return Ok(new { code = code }); // For development only
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpPost("mfa/verify")]
        public async Task<IActionResult> VerifyMFACode([FromBody] VerifyMFARequest request)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                // Get user
                using var userCmd = new MySqlCommand(
                    "SELECT id, mfa_secret FROM users WHERE email = @email",
                    connection);
                userCmd.Parameters.AddWithValue("@email", request.Email);
                
                using var reader = await userCmd.ExecuteReaderAsync();
                if (!reader.Read())
                {
                    return NotFound(new { message = "User not found" });
                }

                var idOrd = reader.GetOrdinal("id");
                var mfaOrd = reader.GetOrdinal("mfa_secret");
                var userId = reader.GetInt32(idOrd);
                var mfaSecret = reader.GetString(mfaOrd);
                
                reader.Close();

                // Verify code
                if (mfaSecret != request.Code)
                {
                    return BadRequest(new { message = "Invalid MFA code" });
                }

                return Ok(new { verified = true, userId = userId });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        private static string HashPassword(string password)
        {
            using var sha256 = SHA256.Create();
            var bytes = Encoding.UTF8.GetBytes(password);
            var hash = sha256.ComputeHash(bytes);
            return Convert.ToBase64String(hash);
        }

        private static string GenerateMFASecret()
        {
            return GenerateMFACode();
        }

        private static string GenerateMFACode()
        {
            var random = new Random();
            return random.Next(1000, 9999).ToString();
        }

        private static string ParseConnectionString(string connectionString)
        {
            if (connectionString.StartsWith("mysql://"))
            {
                var uri = new Uri(connectionString.Replace("mysql://", "http://"));
                var userInfo = uri.UserInfo.Split(':');
                var database = uri.AbsolutePath.TrimStart('/');
                return $"Server={uri.Host};Database={database};User={userInfo[0]};Password={userInfo[1]};Port={uri.Port};";
            }
            return connectionString;
        }
    }

    public class RegisterRequest
    {
        public string Email { get; set; } = "";
        public string Password { get; set; } = "";
    }

    public class SendMFARequest
    {
        public string Email { get; set; } = "";
    }

    public class VerifyMFARequest
    {
        public string Email { get; set; } = "";
        public string Code { get; set; } = "";
    }
}

