using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Text.Json;
using System.Net.Mail;
using System.Net;
using MIS321_GroupProject3_Team2.Services;

namespace MIS321_GroupProject3_Team2.Controllers
{
    [ApiController]
    [Route("api/verifications")]
    public class VerificationController : ControllerBase
    {
        private readonly string _connectionString;
        private readonly QrAuthService _qrAuthService;
        private static readonly Dictionary<string, EmailVerificationCode> _emailVerificationCodes = new();
        private static readonly object _codeLock = new();
        private static DateTime _lastCleanup = DateTime.UtcNow;

        public VerificationController(IConfiguration configuration, QrAuthService qrAuthService)
        {
            _qrAuthService = qrAuthService;
            var configConn = configuration.GetConnectionString("DefaultConnection");
            if (string.IsNullOrEmpty(configConn) || configConn == "${JAWSDB_URL}")
            {
                configConn = null;
            }
            _connectionString = configConn 
                ?? Environment.GetEnvironmentVariable("JAWSDB_URL") 
                ?? "mysql://rafzxyujgowd9c4f:u40pss81sz1ub6t8@durvbryvdw2sjcm5.cbetxkdyhwsb.us-east-1.rds.amazonaws.com:3306/p14kvqervonda4dv";
        }

        [HttpPost("register-pending")]
        public async Task<IActionResult> RegisterPendingUser([FromBody] RegisterPendingUserRequest request)
        {
            try
            {
                // Validate required fields
                if (string.IsNullOrWhiteSpace(request.Name))
                {
                    return BadRequest(new { success = false, message = "Name is required" });
                }
                if (string.IsNullOrWhiteSpace(request.Email))
                {
                    return BadRequest(new { success = false, message = "Email is required" });
                }
                
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                // Check if email already exists
                using var checkCmd = new MySqlCommand(
                    "SELECT id FROM users WHERE email = @email",
                    connection);
                checkCmd.Parameters.AddWithValue("@email", request.Email);
                
                using var checkReader = await checkCmd.ExecuteReaderAsync();
                int userId;
                if (checkReader.Read())
                {
                    userId = checkReader.GetInt32("id");
                    checkReader.Close();
                }
                else
                {
                    checkReader.Close();
                    
                    // Create new user with pending status
                    // Generate a temporary password hash (user will need to set password later)
                    var tempPassword = System.Guid.NewGuid().ToString();
                    var passwordHash = HashPassword(tempPassword);
                    
                    // Generate MFA secret
                    var mfaSecret = GenerateMFASecret();
                    
                    using var insertUserCmd = new MySqlCommand(
                        "INSERT INTO users (email, password_hash, mfa_secret, is_verified, requires_review, classification) VALUES (@email, @password_hash, @mfa_secret, @is_verified, @requires_review, 'user')",
                        connection);
                    insertUserCmd.Parameters.AddWithValue("@email", request.Email);
                    insertUserCmd.Parameters.AddWithValue("@password_hash", passwordHash);
                    insertUserCmd.Parameters.AddWithValue("@mfa_secret", mfaSecret);
                    insertUserCmd.Parameters.AddWithValue("@is_verified", false);
                    insertUserCmd.Parameters.AddWithValue("@requires_review", false);
                    
                    await insertUserCmd.ExecuteNonQueryAsync();
                    userId = (int)insertUserCmd.LastInsertedId;
                }

                // Store verification data as JSON in reason field
                var verificationData = JsonSerializer.Serialize(new
                {
                    name = request.Name ?? "",
                    email = request.Email ?? "",
                    phone = request.Phone ?? "",
                    organization = request.Organization ?? "",
                    govId = request.GovId ?? "",
                    hasDocument = request.HasDocument,
                    companyEmail = request.CompanyEmail ?? "",
                    riskScore = request.RiskScore,
                    riskLevel = request.RiskLevel ?? "low",
                    urgency = request.Urgency,
                    credibility = request.Credibility,
                    trustScore = request.TrustScore,
                    factors = request.Factors
                });

                // Check if verification already exists for this user
                using var checkVerificationCmd = new MySqlCommand(
                    "SELECT id FROM pending_verifications WHERE user_id = @user_id AND status = 'pending'",
                    connection);
                checkVerificationCmd.Parameters.AddWithValue("@user_id", userId);
                
                var existingVerificationId = await checkVerificationCmd.ExecuteScalarAsync();
                int verificationId;
                
                if (existingVerificationId != null)
                {
                    verificationId = Convert.ToInt32(existingVerificationId);
                    // Update existing verification
                    using var updateCmd = new MySqlCommand(
                        "UPDATE pending_verifications SET reason = @reason WHERE id = @id",
                        connection);
                    updateCmd.Parameters.AddWithValue("@reason", verificationData);
                    updateCmd.Parameters.AddWithValue("@id", verificationId);
                    await updateCmd.ExecuteNonQueryAsync();
                }
                else
                {
                    // Create new verification record
                    using var insertVerificationCmd = new MySqlCommand(
                        "INSERT INTO pending_verifications (user_id, reason, status) VALUES (@user_id, @reason, 'pending')",
                        connection);
                    insertVerificationCmd.Parameters.AddWithValue("@user_id", userId);
                    insertVerificationCmd.Parameters.AddWithValue("@reason", verificationData);
                    
                    await insertVerificationCmd.ExecuteNonQueryAsync();
                    verificationId = (int)insertVerificationCmd.LastInsertedId;
                }

                return Ok(new { 
                    success = true,
                    userId = userId,
                    verificationId = verificationId,
                    status = "pending",
                    message = "Your account has been created and is pending admin approval."
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
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
                    companyEmail = request.CompanyEmail,
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

                // Generate signed QR payload (NOT stored in database)
                var signedPayload = _qrAuthService.GenerateQrPayload(userId);
                var qrImageBytes = _qrAuthService.GenerateQrCodeImage(signedPayload);
                var qrCodeBase64 = Convert.ToBase64String(qrImageBytes);

                // Update verification status
                var reasonData = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(reasonJson) ?? new Dictionary<string, JsonElement>();
                var updatedReason = JsonSerializer.Serialize(reasonData);

                using var updateVerificationCmd = new MySqlCommand(
                    "UPDATE pending_verifications SET status = 'approved', reason = @reason, reviewed_at = NOW() WHERE id = @id",
                    connection);
                updateVerificationCmd.Parameters.AddWithValue("@reason", updatedReason);
                updateVerificationCmd.Parameters.AddWithValue("@id", id);
                await updateVerificationCmd.ExecuteNonQueryAsync();

                // Update user (remove passport_hash - no longer needed)
                using var updateUserCmd = new MySqlCommand(
                    "UPDATE users SET is_verified = TRUE WHERE id = @user_id",
                    connection);
                updateUserCmd.Parameters.AddWithValue("@user_id", userId);
                await updateUserCmd.ExecuteNonQueryAsync();

                // Add admin notes if provided
                if (!string.IsNullOrEmpty(request.AdminNotes))
                {
                    // Use the existing reasonData and add admin notes
                    reasonData["adminNotes"] = JsonSerializer.SerializeToElement(request.AdminNotes);
                    updatedReason = JsonSerializer.Serialize(reasonData);
                    
                    using var updateNotesCmd = new MySqlCommand(
                        "UPDATE pending_verifications SET reason = @reason WHERE id = @id",
                        connection);
                    updateNotesCmd.Parameters.AddWithValue("@reason", updatedReason);
                    updateNotesCmd.Parameters.AddWithValue("@id", id);
                    await updateNotesCmd.ExecuteNonQueryAsync();
                }

                return Ok(new { 
                    message = "Verification approved",
                    qrCodeBase64 = qrCodeBase64,
                    userId = userId
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


        [HttpPost("email/send")]
        public async Task<IActionResult> SendCompanyEmailVerification([FromBody] SendEmailVerificationRequest request)
        {
            try
            {
                if (string.IsNullOrEmpty(request.Email) || !IsValidEmail(request.Email))
                {
                    return BadRequest(new { success = false, message = "Invalid email address" });
                }

                // Generate verification code (6-8 alphanumeric characters)
                var code = GenerateVerificationCode();
                var verificationId = Guid.NewGuid().ToString();

                // Store code with expiry (10 minutes)
                lock (_codeLock)
                {
                    // Cleanup expired codes periodically
                    CleanupExpiredCodes();
                    
                    _emailVerificationCodes[verificationId] = new EmailVerificationCode
                    {
                        Email = request.Email.ToLower(),
                        Code = code,
                        ExpiresAt = DateTime.UtcNow.AddMinutes(10),
                        VerificationId = verificationId
                    };
                }

                // Send email
                var emailSent = await SendVerificationEmail(request.Email, code);
                
                if (!emailSent)
                {
                    lock (_codeLock)
                    {
                        _emailVerificationCodes.Remove(verificationId);
                    }
                    return StatusCode(500, new { success = false, message = "Failed to send verification email. Please check your email address and try again." });
                }

                return Ok(new { success = true, verificationId = verificationId, message = "Verification code sent successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("email/verify")]
        public IActionResult VerifyCompanyEmailCode([FromBody] VerifyEmailCodeRequest request)
        {
            try
            {
                if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.Code))
                {
                    return BadRequest(new { success = false, message = "Email and code are required" });
                }

                lock (_codeLock)
                {
                    // Find matching verification code
                    var verification = _emailVerificationCodes.Values
                        .FirstOrDefault(v => v.Email == request.Email.ToLower() && 
                                            v.Code == request.Code.ToUpper() && 
                                            v.ExpiresAt > DateTime.UtcNow);

                    if (verification == null)
                    {
                        return BadRequest(new { success = false, message = "Invalid or expired verification code" });
                    }

                    // Remove used code
                    _emailVerificationCodes.Remove(verification.VerificationId);

                    return Ok(new { success = true, message = "Email verified successfully" });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("captcha/verify")]
        public async Task<IActionResult> VerifyCaptcha([FromBody] VerifyCaptchaRequest request)
        {
            try
            {
                if (string.IsNullOrEmpty(request.Token))
                {
                    return BadRequest(new { success = false, message = "CAPTCHA token is required" });
                }

                // Get reCAPTCHA secret key from environment or configuration
                var secretKey = Environment.GetEnvironmentVariable("RECAPTCHA_SECRET_KEY") 
                    ?? "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe"; // Test secret key - replace with your actual key

                // Verify with Google reCAPTCHA API
                using var httpClient = new HttpClient();
                var response = await httpClient.PostAsync(
                    $"https://www.google.com/recaptcha/api/siteverify?secret={secretKey}&response={request.Token}",
                    null);

                var responseContent = await response.Content.ReadAsStringAsync();
                var result = JsonSerializer.Deserialize<JsonElement>(responseContent);

                if (result.TryGetProperty("success", out var successElement) && successElement.GetBoolean())
                {
                    return Ok(new { success = true, message = "CAPTCHA verified successfully" });
                }
                else
                {
                    return BadRequest(new { success = false, message = "CAPTCHA verification failed" });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        private static string GenerateVerificationCode()
        {
            const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            var random = new Random();
            var length = random.Next(6, 9); // 6-8 characters
            return new string(Enumerable.Repeat(chars, length)
                .Select(s => s[random.Next(s.Length)]).ToArray());
        }

        private static async Task<bool> SendVerificationEmail(string email, string code)
        {
            try
            {
                // Get SMTP settings from environment variables
                var smtpHost = Environment.GetEnvironmentVariable("SMTP_HOST") ?? "smtp.gmail.com";
                var smtpPort = int.Parse(Environment.GetEnvironmentVariable("SMTP_PORT") ?? "587");
                var smtpUsername = Environment.GetEnvironmentVariable("SMTP_USERNAME") ?? "";
                var smtpPassword = Environment.GetEnvironmentVariable("SMTP_PASSWORD") ?? "";
                var smtpFromEmail = Environment.GetEnvironmentVariable("SMTP_FROM_EMAIL") ?? smtpUsername;
                var smtpFromName = Environment.GetEnvironmentVariable("SMTP_FROM_NAME") ?? "Bio-Isac Verification";

                // If no SMTP credentials are configured, log and return false
                if (string.IsNullOrEmpty(smtpUsername) || string.IsNullOrEmpty(smtpPassword))
                {
                    Console.WriteLine($"SMTP not configured. Would send code {code} to {email}");
                    // For development/testing, you might want to return true here
                    // In production, you should always return false if SMTP is not configured
                    return false;
                }

                using var mailMessage = new MailMessage();
                mailMessage.From = new MailAddress(smtpFromEmail, smtpFromName);
                mailMessage.To.Add(email);
                mailMessage.Subject = "Bio-Isac Email Verification Code";
                mailMessage.Body = $@"
Hello,

Your email verification code is: {code}

This code will expire in 10 minutes.

If you did not request this code, please ignore this email.

Best regards,
Bio-Isac Team
";
                mailMessage.IsBodyHtml = false;

                using var smtpClient = new SmtpClient(smtpHost, smtpPort);
                smtpClient.EnableSsl = true;
                smtpClient.Credentials = new NetworkCredential(smtpUsername, smtpPassword);

                await smtpClient.SendMailAsync(mailMessage);
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error sending email: {ex.Message}");
                return false;
            }
        }

        private static bool IsValidEmail(string email)
        {
            try
            {
                var addr = new System.Net.Mail.MailAddress(email);
                return addr.Address == email;
            }
            catch
            {
                return false;
            }
        }

        private static void CleanupExpiredCodes()
        {
            // Cleanup every 5 minutes
            if ((DateTime.UtcNow - _lastCleanup).TotalMinutes < 5)
                return;

            var expiredKeys = _emailVerificationCodes
                .Where(kvp => kvp.Value.ExpiresAt < DateTime.UtcNow)
                .Select(kvp => kvp.Key)
                .ToList();

            foreach (var key in expiredKeys)
            {
                _emailVerificationCodes.Remove(key);
            }

            _lastCleanup = DateTime.UtcNow;
        }

        private static string HashPassword(string password)
        {
            using var sha256 = System.Security.Cryptography.SHA256.Create();
            var bytes = System.Text.Encoding.UTF8.GetBytes(password);
            var hash = sha256.ComputeHash(bytes);
            return Convert.ToBase64String(hash);
        }

        private static string GenerateMFASecret()
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

        private class EmailVerificationCode
        {
            public string Email { get; set; } = "";
            public string Code { get; set; } = "";
            public DateTime ExpiresAt { get; set; }
            public string VerificationId { get; set; } = "";
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
        public string? CompanyEmail { get; set; }
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

    public class SendEmailVerificationRequest
    {
        public string Email { get; set; } = "";
    }

    public class VerifyEmailCodeRequest
    {
        public string Email { get; set; } = "";
        public string Code { get; set; } = "";
    }

    public class VerifyCaptchaRequest
    {
        public string Token { get; set; } = "";
    }

    public class RegisterPendingUserRequest
    {
        public string Name { get; set; } = "";
        public string Email { get; set; } = "";
        public string? Phone { get; set; }
        public string? Organization { get; set; }
        public string? GovId { get; set; }
        public bool HasDocument { get; set; }
        public string? CompanyEmail { get; set; }
        public double RiskScore { get; set; }
        public string RiskLevel { get; set; } = "low";
        public double Urgency { get; set; }
        public double Credibility { get; set; }
        public double TrustScore { get; set; }
        public object? Factors { get; set; }
    }
}

