using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Text.Json;

namespace MIS321_GroupProject3_Team2.Controllers
{
    [ApiController]
    [Route("api/verifications")]
    public class VerificationController : ControllerBase
    {
        private readonly string _connectionString;

        public VerificationController(IConfiguration configuration)
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

        [HttpPost]
        public async Task<IActionResult> CreateVerification([FromBody] CreateVerificationRequest request)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                // Store verification data as JSON in reason field
                var verificationData = JsonSerializer.Serialize(new
                {
                    name = request.Name,
                    email = request.Email,
                    phone = request.Phone,
                    organization = request.Organization,
                    govId = request.GovId,
                    hasDocument = request.HasDocument,
                    license = request.License,
                    riskScore = request.RiskScore,
                    riskLevel = request.RiskLevel,
                    urgency = request.Urgency,
                    credibility = request.Credibility,
                    trustScore = request.TrustScore,
                    factors = request.Factors
                });

                using var cmd = new MySqlCommand(
                    "INSERT INTO pending_verifications (user_id, reason, status) VALUES (@user_id, @reason, 'pending')",
                    connection);
                cmd.Parameters.AddWithValue("@user_id", request.UserId);
                cmd.Parameters.AddWithValue("@reason", verificationData);
                
                await cmd.ExecuteNonQueryAsync();
                var verificationId = (int)cmd.LastInsertedId;

                return Ok(new { 
                    id = verificationId,
                    userId = request.UserId,
                    status = "pending"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpGet]
        public async Task<IActionResult> GetVerifications()
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                using var cmd = new MySqlCommand(
                    "SELECT id, user_id, reason, status, created_at, reviewed_at FROM pending_verifications ORDER BY created_at DESC",
                    connection);

                var verifications = new List<object>();
                using var reader = await cmd.ExecuteReaderAsync();
                
                while (await reader.ReadAsync())
                {
                    var reasonOrd = reader.GetOrdinal("reason");
                    var idOrd = reader.GetOrdinal("id");
                    var userIdOrd = reader.GetOrdinal("user_id");
                    var statusOrd = reader.GetOrdinal("status");
                    var createdOrd = reader.GetOrdinal("created_at");
                    var reviewedOrd = reader.GetOrdinal("reviewed_at");

                    var reasonJson = reader.IsDBNull(reasonOrd) ? "{}" : reader.GetString(reasonOrd);
                    var verificationData = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(reasonJson) ?? new Dictionary<string, JsonElement>();

                    verifications.Add(new
                    {
                        id = reader.GetInt32(idOrd),
                        userId = reader.GetInt32(userIdOrd),
                        status = reader.GetString(statusOrd),
                        name = verificationData.ContainsKey("name") ? verificationData["name"].GetString() : null,
                        email = verificationData.ContainsKey("email") ? verificationData["email"].GetString() : null,
                        phone = verificationData.ContainsKey("phone") ? verificationData["phone"].GetString() : null,
                        organization = verificationData.ContainsKey("organization") ? verificationData["organization"].GetString() : null,
                        riskScore = verificationData.ContainsKey("riskScore") ? verificationData["riskScore"].GetDouble() : 0.0,
                        riskLevel = verificationData.ContainsKey("riskLevel") ? verificationData["riskLevel"].GetString() : "low",
                        urgency = verificationData.ContainsKey("urgency") ? verificationData["urgency"].GetDouble() : 0.0,
                        credibility = verificationData.ContainsKey("credibility") ? verificationData["credibility"].GetDouble() : 0.0,
                        trustScore = verificationData.ContainsKey("trustScore") ? verificationData["trustScore"].GetDouble() : 0.0,
                        factors = verificationData.ContainsKey("factors") ? (object?)verificationData["factors"] : null,
                        createdAt = reader.GetDateTime(createdOrd).ToString("yyyy-MM-ddTHH:mm:ss"),
                        reviewedAt = reader.IsDBNull(reviewedOrd) ? null : reader.GetDateTime(reviewedOrd).ToString("yyyy-MM-ddTHH:mm:ss")
                    });
                }

                return Ok(verifications);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetVerification(int id)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                using var cmd = new MySqlCommand(
                    "SELECT id, user_id, reason, status, created_at, reviewed_at FROM pending_verifications WHERE id = @id",
                    connection);
                cmd.Parameters.AddWithValue("@id", id);

                using var reader = await cmd.ExecuteReaderAsync();
                if (!reader.Read())
                {
                    return NotFound(new { message = "Verification not found" });
                }

                var reasonOrd = reader.GetOrdinal("reason");
                var idOrd = reader.GetOrdinal("id");
                var userIdOrd = reader.GetOrdinal("user_id");
                var statusOrd = reader.GetOrdinal("status");
                var createdOrd = reader.GetOrdinal("created_at");
                var reviewedOrd = reader.GetOrdinal("reviewed_at");

                var reasonJson = reader.IsDBNull(reasonOrd) ? "{}" : reader.GetString(reasonOrd);
                var verificationData = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(reasonJson) ?? new Dictionary<string, JsonElement>();

                var verification = new
                {
                    id = reader.GetInt32(idOrd),
                    userId = reader.GetInt32(userIdOrd),
                    status = reader.GetString(statusOrd),
                    name = verificationData.ContainsKey("name") ? verificationData["name"].GetString() : null,
                    email = verificationData.ContainsKey("email") ? verificationData["email"].GetString() : null,
                    phone = verificationData.ContainsKey("phone") ? verificationData["phone"].GetString() : null,
                    organization = verificationData.ContainsKey("organization") ? verificationData["organization"].GetString() : null,
                    riskScore = verificationData.ContainsKey("riskScore") ? verificationData["riskScore"].GetDouble() : 0.0,
                    riskLevel = verificationData.ContainsKey("riskLevel") ? verificationData["riskLevel"].GetString() : "low",
                    urgency = verificationData.ContainsKey("urgency") ? verificationData["urgency"].GetDouble() : 0.0,
                    credibility = verificationData.ContainsKey("credibility") ? verificationData["credibility"].GetDouble() : 0.0,
                    trustScore = verificationData.ContainsKey("trustScore") ? verificationData["trustScore"].GetDouble() : 0.0,
                    factors = verificationData.ContainsKey("factors") ? (object?)verificationData["factors"] : null,
                    createdAt = reader.GetDateTime(createdOrd).ToString("yyyy-MM-ddTHH:mm:ss"),
                    reviewedAt = reader.IsDBNull(reviewedOrd) ? null : reader.GetDateTime(reviewedOrd).ToString("yyyy-MM-ddTHH:mm:ss")
                };

                return Ok(verification);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpGet("user/{userId}")]
        public async Task<IActionResult> GetVerificationsByUserId(int userId)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                using var cmd = new MySqlCommand(
                    "SELECT id, user_id, reason, status, created_at, reviewed_at FROM pending_verifications WHERE user_id = @user_id ORDER BY created_at DESC",
                    connection);
                cmd.Parameters.AddWithValue("@user_id", userId);

                var verifications = new List<object>();
                using var reader = await cmd.ExecuteReaderAsync();
                
                while (await reader.ReadAsync())
                {
                    var reasonOrd = reader.GetOrdinal("reason");
                    var idOrd = reader.GetOrdinal("id");
                    var userIdOrd = reader.GetOrdinal("user_id");
                    var statusOrd = reader.GetOrdinal("status");
                    var createdOrd = reader.GetOrdinal("created_at");

                    var reasonJson = reader.IsDBNull(reasonOrd) ? "{}" : reader.GetString(reasonOrd);
                    var verificationData = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(reasonJson) ?? new Dictionary<string, JsonElement>();

                    verifications.Add(new
                    {
                        id = reader.GetInt32(idOrd),
                        userId = reader.GetInt32(userIdOrd),
                        status = reader.GetString(statusOrd),
                        name = verificationData.ContainsKey("name") ? verificationData["name"].GetString() : null,
                        email = verificationData.ContainsKey("email") ? verificationData["email"].GetString() : null,
                        riskScore = verificationData.ContainsKey("riskScore") ? verificationData["riskScore"].GetDouble() : 0.0,
                        riskLevel = verificationData.ContainsKey("riskLevel") ? verificationData["riskLevel"].GetString() : "low",
                        createdAt = reader.GetDateTime(createdOrd).ToString("yyyy-MM-ddTHH:mm:ss")
                    });
                }

                return Ok(verifications);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateVerification(int id, [FromBody] UpdateVerificationRequest request)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                var updates = new List<string>();
                var parameters = new List<MySqlParameter>();

                if (!string.IsNullOrEmpty(request.Status))
                {
                    updates.Add("status = @status");
                    parameters.Add(new MySqlParameter("@status", request.Status));
                }

                if (!string.IsNullOrEmpty(request.AdminNotes))
                {
                    // Get existing reason and add admin notes
                    using var getCmd = new MySqlCommand(
                        "SELECT reason FROM pending_verifications WHERE id = @id",
                        connection);
                    getCmd.Parameters.AddWithValue("@id", id);
                    var existingReason = await getCmd.ExecuteScalarAsync() as string;
                    
                    var reasonData = string.IsNullOrEmpty(existingReason) 
                        ? new Dictionary<string, JsonElement>() 
                        : JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(existingReason) ?? new Dictionary<string, JsonElement>();
                    
                    reasonData["adminNotes"] = JsonSerializer.SerializeToElement(request.AdminNotes);
                    var updatedReason = JsonSerializer.Serialize(reasonData);
                    
                    updates.Add("reason = @reason");
                    parameters.Add(new MySqlParameter("@reason", updatedReason));
                }

                if (request.ReviewedAt.HasValue)
                {
                    updates.Add("reviewed_at = @reviewed_at");
                    parameters.Add(new MySqlParameter("@reviewed_at", request.ReviewedAt.Value));
                }

                if (updates.Count == 0)
                {
                    return BadRequest(new { message = "No fields to update" });
                }

                var sql = $"UPDATE pending_verifications SET {string.Join(", ", updates)} WHERE id = @id";
                using var cmd = new MySqlCommand(sql, connection);
                cmd.Parameters.AddWithValue("@id", id);
                foreach (var param in parameters)
                {
                    cmd.Parameters.Add(param);
                }

                await cmd.ExecuteNonQueryAsync();

                return Ok(new { message = "Verification updated successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpPost("{id}/approve")]
        public async Task<IActionResult> ApproveVerification(int id, [FromBody] ApproveVerificationRequest request)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                // Get verification
                using var getCmd = new MySqlCommand(
                    "SELECT user_id, reason FROM pending_verifications WHERE id = @id",
                    connection);
                getCmd.Parameters.AddWithValue("@id", id);
                
                using var reader = await getCmd.ExecuteReaderAsync();
                if (!reader.Read())
                {
                    return NotFound(new { message = "Verification not found" });
                }

                var userIdOrd = reader.GetOrdinal("user_id");
                var reasonOrd = reader.GetOrdinal("reason");
                var userId = reader.GetInt32(userIdOrd);
                var reasonJson = reader.IsDBNull(reasonOrd) ? "{}" : reader.GetString(reasonOrd);
                reader.Close();

                // Generate 10-digit passport code
                var passportCode = GeneratePassportCode();
                var passportHash = HashPassportCode(passportCode);

                // Update verification status
                using var updateVerificationCmd = new MySqlCommand(
                    "UPDATE pending_verifications SET status = 'approved', reviewed_at = NOW() WHERE id = @id",
                    connection);
                updateVerificationCmd.Parameters.AddWithValue("@id", id);
                await updateVerificationCmd.ExecuteNonQueryAsync();

                // Update user
                using var updateUserCmd = new MySqlCommand(
                    "UPDATE users SET is_verified = TRUE, passport_hash = @passport_hash WHERE id = @user_id",
                    connection);
                updateUserCmd.Parameters.AddWithValue("@passport_hash", passportHash);
                updateUserCmd.Parameters.AddWithValue("@user_id", userId);
                await updateUserCmd.ExecuteNonQueryAsync();

                // Add admin notes if provided
                if (!string.IsNullOrEmpty(request.AdminNotes))
                {
                    var reasonData = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(reasonJson) ?? new Dictionary<string, JsonElement>();
                    reasonData["adminNotes"] = JsonSerializer.SerializeToElement(request.AdminNotes);
                    var updatedReason = JsonSerializer.Serialize(reasonData);
                    
                    using var updateNotesCmd = new MySqlCommand(
                        "UPDATE pending_verifications SET reason = @reason WHERE id = @id",
                        connection);
                    updateNotesCmd.Parameters.AddWithValue("@reason", updatedReason);
                    updateNotesCmd.Parameters.AddWithValue("@id", id);
                    await updateNotesCmd.ExecuteNonQueryAsync();
                }

                return Ok(new { 
                    message = "Verification approved",
                    passportCode = passportCode,
                    passportHash = passportHash
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpPost("{id}/deny")]
        public async Task<IActionResult> DenyVerification(int id, [FromBody] DenyVerificationRequest request)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                // Update verification status
                using var cmd = new MySqlCommand(
                    "UPDATE pending_verifications SET status = 'rejected', reviewed_at = NOW() WHERE id = @id",
                    connection);
                cmd.Parameters.AddWithValue("@id", id);
                await cmd.ExecuteNonQueryAsync();

                // Add admin notes if provided
                if (!string.IsNullOrEmpty(request.AdminNotes))
                {
                    using var getCmd = new MySqlCommand(
                        "SELECT reason FROM pending_verifications WHERE id = @id",
                        connection);
                    getCmd.Parameters.AddWithValue("@id", id);
                    var existingReason = await getCmd.ExecuteScalarAsync() as string;
                    
                    var reasonData = string.IsNullOrEmpty(existingReason) 
                        ? new Dictionary<string, JsonElement>() 
                        : JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(existingReason) ?? new Dictionary<string, JsonElement>();
                    
                    reasonData["adminNotes"] = JsonSerializer.SerializeToElement(request.AdminNotes);
                    var updatedReason = JsonSerializer.Serialize(reasonData);
                    
                    using var updateNotesCmd = new MySqlCommand(
                        "UPDATE pending_verifications SET reason = @reason WHERE id = @id",
                        connection);
                    updateNotesCmd.Parameters.AddWithValue("@reason", updatedReason);
                    updateNotesCmd.Parameters.AddWithValue("@id", id);
                    await updateNotesCmd.ExecuteNonQueryAsync();
                }

                return Ok(new { message = "Verification denied" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        private static string GeneratePassportCode()
        {
            var random = new Random();
            var code = "";
            for (int i = 0; i < 10; i++)
            {
                code += random.Next(0, 10).ToString();
            }
            return code;
        }

        private static string HashPassportCode(string code)
        {
            using var sha256 = System.Security.Cryptography.SHA256.Create();
            var bytes = System.Text.Encoding.UTF8.GetBytes(code);
            var hash = sha256.ComputeHash(bytes);
            return Convert.ToBase64String(hash);
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

    public class CreateVerificationRequest
    {
        public int UserId { get; set; }
        public string Name { get; set; } = "";
        public string Email { get; set; } = "";
        public string Phone { get; set; } = "";
        public string Organization { get; set; } = "";
        public string? GovId { get; set; }
        public bool HasDocument { get; set; }
        public string? License { get; set; }
        public double RiskScore { get; set; }
        public string RiskLevel { get; set; } = "low";
        public double Urgency { get; set; }
        public double Credibility { get; set; }
        public double TrustScore { get; set; }
        public object? Factors { get; set; }
    }

    public class UpdateVerificationRequest
    {
        public string? Status { get; set; }
        public string? AdminNotes { get; set; }
        public DateTime? ReviewedAt { get; set; }
    }

    public class ApproveVerificationRequest
    {
        public string? AdminNotes { get; set; }
    }

    public class DenyVerificationRequest
    {
        public string? AdminNotes { get; set; }
    }
}

