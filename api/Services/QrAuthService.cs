using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using QRCoder;

namespace MIS321_GroupProject3_Team2.Services
{
    public class QrAuthService
    {
        private readonly string _secretKey;

        public QrAuthService(IConfiguration configuration)
        {
            // Get secret from environment variable or configuration
            _secretKey = Environment.GetEnvironmentVariable("QR_AUTH_SECRET") 
                ?? configuration["QrAuth:Secret"] 
                ?? "default-secret-key-change-in-production-min-32-chars";
            
            // Ensure secret is at least 32 characters for HMAC SHA256
            if (_secretKey.Length < 32)
            {
                throw new InvalidOperationException("QR_AUTH_SECRET must be at least 32 characters long");
            }
        }

        /// <summary>
        /// Generates a signed QR payload for a user
        /// </summary>
        public string GenerateQrPayload(int userId)
        {
            // Generate random nonce (32 bytes)
            var nonceBytes = new byte[32];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(nonceBytes);
            }
            var nonce = Convert.ToBase64String(nonceBytes);

            // Create payload
            var payload = new
            {
                userId = userId,
                issuedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                nonce = nonce
            };

            // Serialize payload to JSON
            var payloadJson = JsonSerializer.Serialize(payload);
            var payloadBytes = Encoding.UTF8.GetBytes(payloadJson);
            var payloadBase64 = Convert.ToBase64String(payloadBytes)
                .Replace('+', '-')
                .Replace('/', '_')
                .TrimEnd('=');

            // Sign payload with HMAC SHA256
            var signature = ComputeHmac(payloadBase64);
            var signatureBase64 = Convert.ToBase64String(signature)
                .Replace('+', '-')
                .Replace('/', '_')
                .TrimEnd('=');

            // Combine payload and signature: payload.signature
            return $"{payloadBase64}.{signatureBase64}";
        }

        /// <summary>
        /// Validates a QR payload and returns the user ID if valid
        /// </summary>
        public (bool IsValid, int? UserId) ValidateQrPayload(string signedPayload)
        {
            try
            {
                if (string.IsNullOrEmpty(signedPayload))
                {
                    return (false, null);
                }

                // Split payload and signature
                var parts = signedPayload.Split('.');
                if (parts.Length != 2)
                {
                    return (false, null);
                }

                var payloadBase64 = parts[0];
                var signatureBase64 = parts[1];

                // Verify signature
                var expectedSignature = ComputeHmac(payloadBase64);
                var providedSignature = Convert.FromBase64String(
                    signatureBase64.Replace('-', '+').Replace('_', '/') + 
                    new string('=', (4 - (signatureBase64.Length % 4)) % 4));

                // Constant-time comparison to prevent timing attacks
                if (expectedSignature.Length != providedSignature.Length)
                {
                    return (false, null);
                }

                var isValid = true;
                for (int i = 0; i < expectedSignature.Length; i++)
                {
                    isValid &= expectedSignature[i] == providedSignature[i];
                }

                if (!isValid)
                {
                    return (false, null);
                }

                // Decode payload
                var payloadBytes = Convert.FromBase64String(
                    payloadBase64.Replace('-', '+').Replace('_', '/') + 
                    new string('=', (4 - (payloadBase64.Length % 4)) % 4));
                var payloadJson = Encoding.UTF8.GetString(payloadBytes);
                var payload = JsonSerializer.Deserialize<JsonElement>(payloadJson);

                // Extract user ID
                if (!payload.TryGetProperty("userId", out var userIdElement))
                {
                    return (false, null);
                }

                var userId = userIdElement.GetInt32();

                // Optional: Check expiration (e.g., 1 year)
                if (payload.TryGetProperty("issuedAt", out var issuedAtElement))
                {
                    var issuedAt = DateTimeOffset.FromUnixTimeSeconds(issuedAtElement.GetInt64());
                    var expiration = issuedAt.AddYears(1);
                    if (DateTimeOffset.UtcNow > expiration)
                    {
                        return (false, null);
                    }
                }

                return (true, userId);
            }
            catch
            {
                return (false, null);
            }
        }

        /// <summary>
        /// Generates a QR code image (PNG bytes) for a signed payload
        /// </summary>
        public byte[] GenerateQrCodeImage(string signedPayload)
        {
            using var qrGenerator = new QRCodeGenerator();
            var qrCodeData = qrGenerator.CreateQrCode(signedPayload, QRCodeGenerator.ECCLevel.Q);
            using var qrCode = new PngByteQRCode(qrCodeData);
            return qrCode.GetGraphic(20);
        }

        /// <summary>
        /// Computes HMAC SHA256 signature
        /// </summary>
        private byte[] ComputeHmac(string data)
        {
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_secretKey));
            return hmac.ComputeHash(Encoding.UTF8.GetBytes(data));
        }
    }
}

