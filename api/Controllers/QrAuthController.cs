using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using MIS321_GroupProject3_Team2.Services;
using ZXing.ImageSharp;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace MIS321_GroupProject3_Team2.Controllers
{
    [ApiController]
    [Route("api")]
    public class QrAuthController : ControllerBase
    {
        private readonly QrAuthService _qrAuthService;
        private readonly string _connectionString;

        public QrAuthController(QrAuthService qrAuthService, IConfiguration configuration)
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

        /// <summary>
        /// Generate QR code for a user (Admin only)
        /// POST /api/generate-qr
        /// </summary>
        [HttpPost("generate-qr")]
        public async Task<IActionResult> GenerateQr([FromBody] GenerateQrRequest request)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);
                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                // Verify user exists and is verified
                using var userCmd = new MySqlCommand(
                    "SELECT id, email, is_verified, classification FROM users WHERE id = @user_id",
                    connection);
                userCmd.Parameters.AddWithValue("@user_id", request.UserId);

                using var userReader = await userCmd.ExecuteReaderAsync();
                if (!userReader.Read())
                {
                    return NotFound(new { message = "User not found" });
                }

                var idOrd = userReader.GetOrdinal("id");
                var emailOrd = userReader.GetOrdinal("email");
                var verifiedOrd = userReader.GetOrdinal("is_verified");
                var classificationOrd = userReader.GetOrdinal("classification");

                var userId = userReader.GetInt32(idOrd);
                var email = userReader.GetString(emailOrd);
                var isVerified = userReader.GetBoolean(verifiedOrd);
                var classification = userReader.IsDBNull(classificationOrd) ? "user" : userReader.GetString(classificationOrd);
                userReader.Close();

                if (!isVerified)
                {
                    return BadRequest(new { message = "User is not verified" });
                }

                // Generate signed QR payload
                var signedPayload = _qrAuthService.GenerateQrPayload(userId);

                // Generate QR code image
                var qrImageBytes = _qrAuthService.GenerateQrCodeImage(signedPayload);

                // Return QR code as base64 for frontend display
                var qrBase64 = Convert.ToBase64String(qrImageBytes);

                return Ok(new
                {
                    userId = userId,
                    email = email,
                    qrCodeBase64 = qrBase64,
                    message = "QR code generated successfully. Download and share with user."
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        /// <summary>
        /// Login using QR code (accepts file upload or text payload)
        /// POST /api/qr-login
        /// </summary>
        [HttpPost("qr-login")]
        public async Task<IActionResult> QrLogin([FromForm] IFormFile? qrFile, [FromForm] string? qrText)
        {
            try
            {
                string signedPayload = null;

                // Handle file upload
                if (qrFile != null && qrFile.Length > 0)
                {
                    // Read image file
                    using var memoryStream = new MemoryStream();
                    await qrFile.CopyToAsync(memoryStream);
                    memoryStream.Position = 0;

                    // Decode QR code from image using ZXing with ImageSharp 1.x (cross-platform, compatible with ZXing.Net)
                    using var image = Image.Load<Rgba32>(memoryStream);
                    var reader = new BarcodeReader<Rgba32>();
                    var result = reader.Decode(image);

                    if (result == null || string.IsNullOrEmpty(result.Text))
                    {
                        return BadRequest(new { message = "Could not decode QR code from image" });
                    }

                    signedPayload = result.Text;
                }
                // Handle text input
                else if (!string.IsNullOrEmpty(qrText))
                {
                    signedPayload = qrText.Trim();
                }
                else
                {
                    return BadRequest(new { message = "Either QR file or QR text is required" });
                }

                // Validate payload
                var (isValid, userId) = _qrAuthService.ValidateQrPayload(signedPayload);
                if (!isValid || !userId.HasValue)
                {
                    return BadRequest(new { message = "Invalid or expired QR code" });
                }

                // Get user from database
                var connString = ParseConnectionString(_connectionString);
                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                using var userCmd = new MySqlCommand(
                    "SELECT id, email, is_verified, classification FROM users WHERE id = @user_id",
                    connection);
                userCmd.Parameters.AddWithValue("@user_id", userId.Value);

                using var userReader = await userCmd.ExecuteReaderAsync();
                if (!userReader.Read())
                {
                    return NotFound(new { message = "User not found" });
                }

                var idOrd = userReader.GetOrdinal("id");
                var emailOrd = userReader.GetOrdinal("email");
                var verifiedOrd = userReader.GetOrdinal("is_verified");
                var classificationOrd = userReader.GetOrdinal("classification");

                var userEmail = userReader.GetString(emailOrd);
                var isVerified = userReader.GetBoolean(verifiedOrd);
                var classification = userReader.IsDBNull(classificationOrd) ? "user" : userReader.GetString(classificationOrd);
                userReader.Close();

                if (!isVerified)
                {
                    return BadRequest(new { message = "User account is not verified" });
                }

                // Return login success (same format as password login)
                return Ok(new
                {
                    verified = true,
                    userId = userId.Value,
                    email = userEmail,
                    classification = classification
                });
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

    public class GenerateQrRequest
    {
        public int UserId { get; set; }
    }
}

