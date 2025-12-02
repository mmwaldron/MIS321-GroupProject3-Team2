using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace MIS321_GroupProject3_Team2.Controllers
{
    [ApiController]
    [Route("api/passport")]
    public class PassportController : ControllerBase
    {
        private readonly string _connectionString;

        public PassportController(IConfiguration configuration)
        {
            var configConn = configuration.GetConnectionString("DefaultConnection");
            if (string.IsNullOrEmpty(configConn) || configConn == "${JAWSDB_URL}")
            {
                configConn = null;
            }
            _connectionString = configConn 
                ?? Environment.GetEnvironmentVariable("JAWSDB_URL") 
                ?? "mysql://rafzxyujgowd9c4f:u40pss81sz1ub6t8@durvbryvdw2sjcm5.cbetxkdyhwsb.us-east-1.rds.amazonaws.com:3306/p14kvqervonda4dv";
        }

        [HttpGet("code/{code}")]
        public async Task<IActionResult> GetPassportByCode(string code)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                // Hash the code to compare with passport_hash
                var codeHash = HashPassportCode(code);

                // Find user by passport hash
                using var userCmd = new MySqlCommand(
                    "SELECT id, email, is_verified, passport_hash, created_at FROM users WHERE passport_hash = @passport_hash",
                    connection);
                userCmd.Parameters.AddWithValue("@passport_hash", codeHash);

                using var userReader = await userCmd.ExecuteReaderAsync();
                if (!userReader.Read())
                {
                    return NotFound(new { message = "Invalid passport code" });
                }

                var idOrd = userReader.GetOrdinal("id");
                var emailOrd = userReader.GetOrdinal("email");
                var verifiedOrd = userReader.GetOrdinal("is_verified");
                var createdOrd = userReader.GetOrdinal("created_at");

                var userId = userReader.GetInt32(idOrd);
                var email = userReader.GetString(emailOrd);
                var isVerified = userReader.GetBoolean(verifiedOrd);
                var createdAt = userReader.GetDateTime(createdOrd);
                userReader.Close();

                if (!isVerified)
                {
                    return BadRequest(new { message = "Passport not verified" });
                }

                // Get latest verification for user details
                using var verificationCmd = new MySqlCommand(
                    "SELECT reason FROM pending_verifications WHERE user_id = @user_id AND status = 'approved' ORDER BY reviewed_at DESC LIMIT 1",
                    connection);
                verificationCmd.Parameters.AddWithValue("@user_id", userId);

                var reasonJson = "";
                using var verReader = await verificationCmd.ExecuteReaderAsync();
                if (verReader.Read())
                {
                    var reasonOrd = verReader.GetOrdinal("reason");
                    reasonJson = verReader.IsDBNull(reasonOrd) ? "{}" : verReader.GetString(reasonOrd);
                }
                verReader.Close();

                var verificationData = new Dictionary<string, JsonElement>();
                if (!string.IsNullOrEmpty(reasonJson))
                {
                    verificationData = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(reasonJson) ?? new Dictionary<string, JsonElement>();
                }

                var passport = new
                {
                    userId = userId,
                    code = code,
                    email = email,
                    name = verificationData.ContainsKey("name") ? verificationData["name"].GetString() : null,
                    organization = verificationData.ContainsKey("organization") ? verificationData["organization"].GetString() : null,
                    trustScore = verificationData.ContainsKey("trustScore") ? verificationData["trustScore"].GetDouble() : 0.0,
                    verified = isVerified,
                    verifiedAt = createdAt.ToString("yyyy-MM-ddTHH:mm:ss")
                };

                return Ok(passport);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        private static string HashPassportCode(string code)
        {
            using var sha256 = SHA256.Create();
            var bytes = Encoding.UTF8.GetBytes(code);
            var hash = sha256.ComputeHash(bytes);
            return Convert.ToBase64String(hash);
        }

        [HttpGet("user/{userId}")]
        public async Task<IActionResult> GetUserPassportCode(int userId)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                // Get user to check if verified
                using var userCmd = new MySqlCommand(
                    "SELECT is_verified, passport_hash FROM users WHERE id = @user_id",
                    connection);
                userCmd.Parameters.AddWithValue("@user_id", userId);

                using var userReader = await userCmd.ExecuteReaderAsync();
                if (!userReader.Read())
                {
                    return NotFound(new { message = "User not found" });
                }

                var verifiedOrd = userReader.GetOrdinal("is_verified");
                var passportHashOrd = userReader.GetOrdinal("passport_hash");
                var isVerified = userReader.GetBoolean(verifiedOrd);
                var passportHash = userReader.IsDBNull(passportHashOrd) ? null : userReader.GetString(passportHashOrd);
                userReader.Close();

                if (!isVerified || string.IsNullOrEmpty(passportHash))
                {
                    return BadRequest(new { message = "User not verified or no passport code assigned" });
                }

                // Get passport code from latest approved verification
                using var verificationCmd = new MySqlCommand(
                    "SELECT reason FROM pending_verifications WHERE user_id = @user_id AND status = 'approved' ORDER BY reviewed_at DESC LIMIT 1",
                    connection);
                verificationCmd.Parameters.AddWithValue("@user_id", userId);

                var reasonJson = "";
                using var verReader = await verificationCmd.ExecuteReaderAsync();
                if (verReader.Read())
                {
                    var reasonOrd = verReader.GetOrdinal("reason");
                    reasonJson = verReader.IsDBNull(reasonOrd) ? "{}" : verReader.GetString(reasonOrd);
                }
                verReader.Close();

                // Try to extract passport code from verification data
                var verificationData = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(reasonJson) ?? new Dictionary<string, JsonElement>();
                if (verificationData.ContainsKey("passportCode"))
                {
                    var passportCode = verificationData["passportCode"].GetString();
                    return Ok(new { code = passportCode });
                }

                // If not stored, we can't retrieve it (security: codes are hashed)
                // In production, you'd want to store the code when generating it
                return BadRequest(new { message = "Passport code not available. Please contact admin." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
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
}

