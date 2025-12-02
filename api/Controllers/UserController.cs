using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Text.Json;

namespace MIS321_GroupProject3_Team2.Controllers
{
    [ApiController]
    [Route("api/users")]
    public class UserController : ControllerBase
    {
        private readonly string _connectionString;

        public UserController(IConfiguration configuration)
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

        [HttpGet("{id}")]
        public async Task<IActionResult> GetUser(int id)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                using var cmd = new MySqlCommand(
                    "SELECT id, email, is_verified, requires_review, passport_hash, created_at FROM users WHERE id = @id",
                    connection);
                cmd.Parameters.AddWithValue("@id", id);

                using var reader = await cmd.ExecuteReaderAsync();
                if (!reader.Read())
                {
                    return NotFound(new { message = "User not found" });
                }

                var idOrd = reader.GetOrdinal("id");
                var emailOrd = reader.GetOrdinal("email");
                var verifiedOrd = reader.GetOrdinal("is_verified");
                var reviewOrd = reader.GetOrdinal("requires_review");
                var passportOrd = reader.GetOrdinal("passport_hash");
                var createdOrd = reader.GetOrdinal("created_at");

                var user = new
                {
                    id = reader.GetInt32(idOrd),
                    email = reader.GetString(emailOrd),
                    verified = reader.GetBoolean(verifiedOrd),
                    requiresReview = reader.GetBoolean(reviewOrd),
                    passportHash = reader.IsDBNull(passportOrd) ? null : reader.GetString(passportOrd),
                    createdAt = reader.GetDateTime(createdOrd).ToString("yyyy-MM-ddTHH:mm:ss")
                };

                return Ok(user);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpGet("email/{email}")]
        public async Task<IActionResult> GetUserByEmail(string email)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                using var cmd = new MySqlCommand(
                    "SELECT id, email, is_verified, requires_review, passport_hash, created_at FROM users WHERE email = @email",
                    connection);
                cmd.Parameters.AddWithValue("@email", email);

                using var reader = await cmd.ExecuteReaderAsync();
                if (!reader.Read())
                {
                    return NotFound(new { message = "User not found" });
                }

                var idOrd = reader.GetOrdinal("id");
                var emailOrd = reader.GetOrdinal("email");
                var verifiedOrd = reader.GetOrdinal("is_verified");
                var reviewOrd = reader.GetOrdinal("requires_review");
                var passportOrd = reader.GetOrdinal("passport_hash");
                var createdOrd = reader.GetOrdinal("created_at");

                var user = new
                {
                    id = reader.GetInt32(idOrd),
                    email = reader.GetString(emailOrd),
                    verified = reader.GetBoolean(verifiedOrd),
                    requiresReview = reader.GetBoolean(reviewOrd),
                    passportHash = reader.IsDBNull(passportOrd) ? null : reader.GetString(passportOrd),
                    createdAt = reader.GetDateTime(createdOrd).ToString("yyyy-MM-ddTHH:mm:ss")
                };

                return Ok(user);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateUser(int id, [FromBody] UpdateUserRequest request)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                // Build update query dynamically based on provided fields
                var updates = new List<string>();
                var parameters = new List<MySqlParameter>();

                if (request.IsVerified.HasValue)
                {
                    updates.Add("is_verified = @is_verified");
                    parameters.Add(new MySqlParameter("@is_verified", request.IsVerified.Value));
                }

                if (request.RequiresReview.HasValue)
                {
                    updates.Add("requires_review = @requires_review");
                    parameters.Add(new MySqlParameter("@requires_review", request.RequiresReview.Value));
                }

                if (!string.IsNullOrEmpty(request.PassportHash))
                {
                    updates.Add("passport_hash = @passport_hash");
                    parameters.Add(new MySqlParameter("@passport_hash", request.PassportHash));
                }

                if (updates.Count == 0)
                {
                    return BadRequest(new { message = "No fields to update" });
                }

                var sql = $"UPDATE users SET {string.Join(", ", updates)} WHERE id = @id";
                using var cmd = new MySqlCommand(sql, connection);
                cmd.Parameters.AddWithValue("@id", id);
                foreach (var param in parameters)
                {
                    cmd.Parameters.Add(param);
                }

                await cmd.ExecuteNonQueryAsync();

                return Ok(new { message = "User updated successfully" });
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

    public class UpdateUserRequest
    {
        public bool? IsVerified { get; set; }
        public bool? RequiresReview { get; set; }
        public string? PassportHash { get; set; }
    }
}

