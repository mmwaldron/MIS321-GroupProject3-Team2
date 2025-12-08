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
        private readonly RiskAnalysisService _riskAnalysisService;
        private readonly DocumentAnalysisService _documentAnalysisService;
        private readonly GovernmentIdAnalysisService _governmentIdAnalysisService;
        private static readonly Dictionary<string, EmailVerificationCode> _emailVerificationCodes = new();
        private static readonly object _codeLock = new();
        private static DateTime _lastCleanup = DateTime.UtcNow;

        public VerificationController(IConfiguration configuration, QrAuthService qrAuthService, RiskAnalysisService riskAnalysisService, DocumentAnalysisService documentAnalysisService, GovernmentIdAnalysisService governmentIdAnalysisService)
        {
            _qrAuthService = qrAuthService;
            _riskAnalysisService = riskAnalysisService;
            _documentAnalysisService = documentAnalysisService;
            _governmentIdAnalysisService = governmentIdAnalysisService;
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
                
                // Verify CAPTCHA before processing verification request
                if (string.IsNullOrWhiteSpace(request.CaptchaToken))
                {
                    return BadRequest(new { success = false, message = "CAPTCHA verification is required" });
                }
                
                // Verify CAPTCHA token with Google reCAPTCHA API
                var secretKey = Environment.GetEnvironmentVariable("RECAPTCHA_SECRET_KEY") 
                    ?? "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe"; // Test secret key - replace with your actual key
                
                using var httpClient = new HttpClient();
                var captchaResponse = await httpClient.PostAsync(
                    $"https://www.google.com/recaptcha/api/siteverify?secret={secretKey}&response={request.CaptchaToken}",
                    null);
                
                var captchaResponseContent = await captchaResponse.Content.ReadAsStringAsync();
                var captchaResult = JsonSerializer.Deserialize<JsonElement>(captchaResponseContent);
                
                if (!captchaResult.TryGetProperty("success", out var successElement) || !successElement.GetBoolean())
                {
                    return BadRequest(new { success = false, message = "CAPTCHA verification failed. Please try again." });
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
                    // Note: password_hash column removed, users authenticate via QR codes
                    // Generate MFA secret
                    var mfaSecret = GenerateMFASecret();
                    
                    using var insertUserCmd = new MySqlCommand(
                        "INSERT INTO users (email, mfa_secret, is_verified, requires_review, classification) VALUES (@email, @mfa_secret, @is_verified, @requires_review, 'user')",
                        connection);
                    insertUserCmd.Parameters.AddWithValue("@email", request.Email);
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

                // Check if verification already exists for this user or if a specific verificationId was provided
                int verificationId;
                
                if (request.VerificationId.HasValue)
                {
                    // Use the provided verification ID (e.g., from document upload)
                    verificationId = request.VerificationId.Value;
                    
                    // Verify it belongs to this user and update it
                    using var verifyCmd = new MySqlCommand(
                        "SELECT id FROM pending_verifications WHERE id = @id AND user_id = @user_id",
                        connection);
                    verifyCmd.Parameters.AddWithValue("@id", verificationId);
                    verifyCmd.Parameters.AddWithValue("@user_id", userId);
                    
                    var exists = await verifyCmd.ExecuteScalarAsync();
                    if (exists != null)
                    {
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
                        // Verification ID doesn't match user, create new one
                        using var insertVerificationCmd = new MySqlCommand(
                            "INSERT INTO pending_verifications (user_id, reason, status) VALUES (@user_id, @reason, 'pending')",
                            connection);
                        insertVerificationCmd.Parameters.AddWithValue("@user_id", userId);
                        insertVerificationCmd.Parameters.AddWithValue("@reason", verificationData);
                        
                        await insertVerificationCmd.ExecuteNonQueryAsync();
                        verificationId = (int)insertVerificationCmd.LastInsertedId;
                    }
                }
                else
                {
                    // Check if verification already exists for this user
                    using var checkVerificationCmd = new MySqlCommand(
                        "SELECT id FROM pending_verifications WHERE user_id = @user_id AND status = 'pending'",
                        connection);
                    checkVerificationCmd.Parameters.AddWithValue("@user_id", userId);
                    
                    var existingVerificationId = await checkVerificationCmd.ExecuteScalarAsync();
                    
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

                    // Perform risk analysis
                    var riskAnalysis = _riskAnalysisService.AnalyzeVerification(verificationData);

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
                        riskAnalysis = riskAnalysis,
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

                // Perform risk analysis
                var riskAnalysis = _riskAnalysisService.AnalyzeVerification(verificationData);

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
                    riskAnalysis = riskAnalysis,
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

        [HttpPost("upload-id")]
        public async Task<IActionResult> UploadGovernmentId(
            [FromForm] IFormFile document,
            [FromForm] string idType,
            [FromForm] int userId,
            [FromForm] int? verificationId = null)
        {
            try
            {
                // Validate file
                if (document == null || document.Length == 0)
                {
                    return BadRequest(new { success = false, message = "No file uploaded" });
                }

                // Validate file type
                var allowedExtensions = new[] { ".pdf", ".jpg", ".jpeg", ".png" };
                var fileExtension = Path.GetExtension(document.FileName).ToLower();
                if (!allowedExtensions.Contains(fileExtension))
                {
                    return BadRequest(new { success = false, message = "Invalid file type. Only PDF, JPG, and PNG are allowed." });
                }

                // Validate file size (max 10MB)
                if (document.Length > 10 * 1024 * 1024)
                {
                    return BadRequest(new { success = false, message = "File size exceeds 10MB limit" });
                }

                var connString = ParseConnectionString(_connectionString);
                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                // Get or create verification record
                int actualVerificationId;
                if (verificationId.HasValue)
                {
                    actualVerificationId = verificationId.Value;
                }
                else
                {
                    // Create new verification record if it doesn't exist
                    using var createCmd = new MySqlCommand(
                        "INSERT INTO pending_verifications (user_id, reason, status) VALUES (@user_id, '{}', 'pending')",
                        connection);
                    createCmd.Parameters.AddWithValue("@user_id", userId);
                    await createCmd.ExecuteNonQueryAsync();
                    actualVerificationId = (int)createCmd.LastInsertedId;
                }

                // Generate unique filename
                var fileName = $"{userId}_{actualVerificationId}_{Guid.NewGuid()}{fileExtension}";
                // Use absolute path relative to the API directory
                var apiDirectory = Directory.GetCurrentDirectory();
                var uploadPath = Path.Combine(apiDirectory, "uploads", "verification_documents");
                Directory.CreateDirectory(uploadPath);
                var filePath = Path.Combine(uploadPath, fileName);

                // Save file
                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    await document.CopyToAsync(stream);
                }

                // Analyze document (basic analysis)
                var documentAnalysis = await _documentAnalysisService.AnalyzeDocument(filePath, document);

                // Analyze government ID (ID-specific analysis)
                var idAnalysis = await _governmentIdAnalysisService.AnalyzeGovernmentId(filePath, idType, document.FileName);

                // Store document metadata in database
                int documentId;
                try
                {
                    using var insertCmd = new MySqlCommand(
                        @"INSERT INTO verification_documents
                           (verification_id, user_id, file_name, file_path, file_type, file_size, mime_type, id_type, extracted_data, id_analysis_result, analysis_result)
                          VALUES (@verification_id, @user_id, @file_name, @file_path, @file_type, @file_size, @mime_type, @id_type, @extracted_data, @id_analysis_result, @analysis_result)",
                        connection);
                    insertCmd.Parameters.AddWithValue("@verification_id", actualVerificationId);
                    insertCmd.Parameters.AddWithValue("@user_id", userId);
                    insertCmd.Parameters.AddWithValue("@file_name", document.FileName);
                    insertCmd.Parameters.AddWithValue("@file_path", filePath);
                    insertCmd.Parameters.AddWithValue("@file_type", fileExtension);
                    insertCmd.Parameters.AddWithValue("@file_size", document.Length);
                    insertCmd.Parameters.AddWithValue("@mime_type", document.ContentType);
                    insertCmd.Parameters.AddWithValue("@id_type", idType);
                    insertCmd.Parameters.AddWithValue("@extracted_data", JsonSerializer.Serialize(idAnalysis.ExtractedFields));
                    insertCmd.Parameters.AddWithValue("@id_analysis_result", JsonSerializer.Serialize(idAnalysis));
                    insertCmd.Parameters.AddWithValue("@analysis_result", JsonSerializer.Serialize(documentAnalysis));

                    await insertCmd.ExecuteNonQueryAsync();
                    documentId = (int)insertCmd.LastInsertedId;
                }
                catch (MySqlConnector.MySqlException dbEx) when (dbEx.ErrorCode == MySqlConnector.MySqlErrorCode.UnknownTable)
                {
                    throw new Exception("verification_documents table does not exist. Please run the database migration: Database/migrations/add_verification_documents.sql", dbEx);
                }

                return Ok(new
                {
                    success = true,
                    documentId = documentId,
                    verificationId = actualVerificationId,
                    analysis = idAnalysis,
                    documentAnalysis = documentAnalysis
                });
            }
            catch (Exception ex)
            {
                // Log full exception details for debugging
                Console.WriteLine($"Error in UploadGovernmentId: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
                }
                return StatusCode(500, new { success = false, message = ex.Message, details = ex.StackTrace });
            }
        }

        [HttpGet("document/{documentId}")]
        public async Task<IActionResult> GetDocument(int documentId)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);
                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                using var cmd = new MySqlCommand(
                    "SELECT file_path, file_name, mime_type FROM verification_documents WHERE id = @id",
                    connection);
                cmd.Parameters.AddWithValue("@id", documentId);

                using var reader = await cmd.ExecuteReaderAsync();
                if (!reader.Read())
                {
                    return NotFound(new { message = "Document not found" });
                }

                var filePath = reader.GetString("file_path");
                var fileName = reader.GetString("file_name");
                var mimeType = reader.GetString("mime_type");

                if (!System.IO.File.Exists(filePath))
                {
                    return NotFound(new { message = "File not found on server" });
                }

                var fileBytes = await System.IO.File.ReadAllBytesAsync(filePath);
                return File(fileBytes, mimeType, fileName);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpGet("{verificationId}/documents")]
        public async Task<IActionResult> GetVerificationDocuments(int verificationId)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);
                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                // First, try to get documents by verification_id
                using var cmd = new MySqlCommand(
                    @"SELECT id, file_name, file_type, file_size, mime_type, id_type, extracted_data, id_analysis_result, analysis_result, uploaded_at, user_id
                      FROM verification_documents 
                      WHERE verification_id = @verification_id
                      ORDER BY uploaded_at DESC",
                    connection);
                cmd.Parameters.AddWithValue("@verification_id", verificationId);

                var documents = new List<object>();
                using var reader = await cmd.ExecuteReaderAsync();
                
                while (await reader.ReadAsync())
                {
                    var idAnalysisJson = reader.IsDBNull(reader.GetOrdinal("id_analysis_result")) 
                        ? "{}" 
                        : reader.GetString("id_analysis_result");
                    
                    var analysisJson = reader.IsDBNull(reader.GetOrdinal("analysis_result")) 
                        ? "{}" 
                        : reader.GetString("analysis_result");

                    documents.Add(new
                    {
                        id = reader.GetInt32("id"),
                        fileName = reader.GetString("file_name"),
                        fileType = reader.GetString("file_type"),
                        fileSize = reader.GetInt64("file_size"),
                        mimeType = reader.GetString("mime_type"),
                        idType = reader.IsDBNull(reader.GetOrdinal("id_type")) ? null : reader.GetString("id_type"),
                        extractedData = reader.IsDBNull(reader.GetOrdinal("extracted_data")) 
                            ? null 
                            : JsonSerializer.Deserialize<object>(reader.GetString("extracted_data")),
                        idAnalysis = JsonSerializer.Deserialize<object>(idAnalysisJson),
                        analysis = JsonSerializer.Deserialize<object>(analysisJson),
                        uploadedAt = reader.GetDateTime("uploaded_at").ToString("yyyy-MM-ddTHH:mm:ss")
                    });
                }

                // If no documents found by verification_id, try to find by user_id from the verification
                // This handles cases where documents were uploaded before the verification was finalized
                if (documents.Count == 0)
                {
                    reader.Close();
                    
                    // Get user_id from the verification record
                    using var verificationCmd = new MySqlCommand(
                        "SELECT user_id FROM pending_verifications WHERE id = @verification_id",
                        connection);
                    verificationCmd.Parameters.AddWithValue("@verification_id", verificationId);
                    
                    var userIdObj = await verificationCmd.ExecuteScalarAsync();
                    if (userIdObj != null)
                    {
                        var userId = Convert.ToInt32(userIdObj);
                        
                        // Try to find documents by user_id (including those with different or null verification_id)
                        using var userDocsCmd = new MySqlCommand(
                            @"SELECT id, file_name, file_type, file_size, mime_type, id_type, extracted_data, id_analysis_result, analysis_result, uploaded_at, verification_id
                              FROM verification_documents 
                              WHERE user_id = @user_id
                              ORDER BY uploaded_at DESC
                              LIMIT 10",
                            connection);
                        userDocsCmd.Parameters.AddWithValue("@user_id", userId);
                        
                        using var userDocsReader = await userDocsCmd.ExecuteReaderAsync();
                        var docIdsToUpdate = new List<int>();
                        
                        while (await userDocsReader.ReadAsync())
                        {
                            var docId = userDocsReader.GetInt32("id");
                            var docVerificationId = userDocsReader.IsDBNull(userDocsReader.GetOrdinal("verification_id")) 
                                ? (int?)null 
                                : userDocsReader.GetInt32("verification_id");
                            
                            // If document has a different verification_id or null, mark it for update
                            if (docVerificationId != verificationId)
                            {
                                docIdsToUpdate.Add(docId);
                            }
                            
                            var idAnalysisJson = userDocsReader.IsDBNull(userDocsReader.GetOrdinal("id_analysis_result")) 
                                ? "{}" 
                                : userDocsReader.GetString("id_analysis_result");
                            
                            var analysisJson = userDocsReader.IsDBNull(userDocsReader.GetOrdinal("analysis_result")) 
                                ? "{}" 
                                : userDocsReader.GetString("analysis_result");

                            documents.Add(new
                            {
                                id = docId,
                                fileName = userDocsReader.GetString("file_name"),
                                fileType = userDocsReader.GetString("file_type"),
                                fileSize = userDocsReader.GetInt64("file_size"),
                                mimeType = userDocsReader.GetString("mime_type"),
                                idType = userDocsReader.IsDBNull(userDocsReader.GetOrdinal("id_type")) ? null : userDocsReader.GetString("id_type"),
                                extractedData = userDocsReader.IsDBNull(userDocsReader.GetOrdinal("extracted_data")) 
                                    ? null 
                                    : JsonSerializer.Deserialize<object>(userDocsReader.GetString("extracted_data")),
                                idAnalysis = JsonSerializer.Deserialize<object>(idAnalysisJson),
                                analysis = JsonSerializer.Deserialize<object>(analysisJson),
                                uploadedAt = userDocsReader.GetDateTime("uploaded_at").ToString("yyyy-MM-ddTHH:mm:ss")
                            });
                        }
                        
                        userDocsReader.Close();
                        
                        // Update documents to link them to the correct verification
                        if (docIdsToUpdate.Count > 0)
                        {
                            foreach (var docId in docIdsToUpdate)
                            {
                                using var updateDocCmd = new MySqlCommand(
                                    "UPDATE verification_documents SET verification_id = @verification_id WHERE id = @doc_id",
                                    connection);
                                updateDocCmd.Parameters.AddWithValue("@verification_id", verificationId);
                                updateDocCmd.Parameters.AddWithValue("@doc_id", docId);
                                await updateDocCmd.ExecuteNonQueryAsync();
                            }
                        }
                    }
                }

                return Ok(documents);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message, stackTrace = ex.StackTrace });
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
        public int? VerificationId { get; set; } // Optional: if provided, update existing verification
        public string? CaptchaToken { get; set; } // Required: CAPTCHA verification token
    }
}

