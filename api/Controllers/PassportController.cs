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
                // Legacy endpoint - passport code system has been replaced with QR login
                return BadRequest(new { message = "Passport code system has been replaced. Please use QR code login instead." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpPost("verify-qr-code")]
        public async Task<IActionResult> VerifyQRCode([FromBody] VerifyQRCodeRequest request)
        {
            try
            {
                // Legacy endpoint - passport code system has been replaced with QR login
                return BadRequest(new { message = "Passport code system has been replaced. Please use QR code login at /qr-login instead." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpGet("user/{userId}")]
        public async Task<IActionResult> GetUserPassportCode(int userId)
        {
            try
            {
                // Legacy endpoint - passport code system has been replaced with QR login
                return BadRequest(new { message = "Passport code system has been replaced. Admin can generate QR code using /api/generate-qr endpoint." });
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

    public class VerifyQRCodeRequest
    {
        public string Code { get; set; } = "";
    }
}

