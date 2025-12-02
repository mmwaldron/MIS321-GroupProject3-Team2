using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Text.Json;

namespace MIS321_GroupProject3_Team2.Controllers
{
    [ApiController]
    [Route("api/messages")]
    public class MessageController : ControllerBase
    {
        private readonly string _connectionString;

        public MessageController(IConfiguration configuration)
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
        public async Task<IActionResult> CreateMessage([FromBody] CreateMessageRequest request)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                // Store message in audit_logs as a message action
                var details = JsonSerializer.Serialize(new
                {
                    subject = request.Subject,
                    message = request.Message,
                    toUserId = request.ToUserId,
                    read = false
                });

                using var cmd = new MySqlCommand(
                    "INSERT INTO audit_logs (user_id, action, details) VALUES (@user_id, 'message', @details)",
                    connection);
                cmd.Parameters.AddWithValue("@user_id", request.UserId);
                cmd.Parameters.AddWithValue("@details", details);
                
                await cmd.ExecuteNonQueryAsync();
                var messageId = (int)cmd.LastInsertedId;

                return Ok(new { 
                    id = messageId,
                    userId = request.UserId
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpGet]
        public async Task<IActionResult> GetMessages()
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                using var cmd = new MySqlCommand(
                    "SELECT id, user_id, action, details, created_at FROM audit_logs WHERE action = 'message' ORDER BY created_at DESC",
                    connection);

                var messages = new List<object>();
                using var reader = await cmd.ExecuteReaderAsync();
                
                while (await reader.ReadAsync())
                {
                    var detailsOrd = reader.GetOrdinal("details");
                    var idOrd = reader.GetOrdinal("id");
                    var userIdOrd = reader.GetOrdinal("user_id");
                    var createdOrd = reader.GetOrdinal("created_at");

                    var detailsJson = reader.IsDBNull(detailsOrd) ? "{}" : reader.GetString(detailsOrd);
                    var details = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(detailsJson) ?? new Dictionary<string, JsonElement>();

                    messages.Add(new
                    {
                        id = reader.GetInt32(idOrd),
                        userId = reader.GetInt32(userIdOrd),
                        subject = details.ContainsKey("subject") ? details["subject"].GetString() : null,
                        message = details.ContainsKey("message") ? details["message"].GetString() : null,
                        read = details.ContainsKey("read") && details["read"].GetBoolean(),
                        createdAt = reader.GetDateTime(createdOrd).ToString("yyyy-MM-ddTHH:mm:ss")
                    });
                }

                return Ok(messages);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpGet("user/{userId}")]
        public async Task<IActionResult> GetMessagesByUserId(int userId)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                using var cmd = new MySqlCommand(
                    "SELECT id, user_id, action, details, created_at FROM audit_logs WHERE action = 'message' AND user_id = @user_id ORDER BY created_at DESC",
                    connection);
                cmd.Parameters.AddWithValue("@user_id", userId);

                var messages = new List<object>();
                using var reader = await cmd.ExecuteReaderAsync();
                
                while (await reader.ReadAsync())
                {
                    var detailsOrd = reader.GetOrdinal("details");
                    var idOrd = reader.GetOrdinal("id");
                    var userIdOrd = reader.GetOrdinal("user_id");
                    var createdOrd = reader.GetOrdinal("created_at");

                    var detailsJson = reader.IsDBNull(detailsOrd) ? "{}" : reader.GetString(detailsOrd);
                    var details = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(detailsJson) ?? new Dictionary<string, JsonElement>();

                    messages.Add(new
                    {
                        id = reader.GetInt32(idOrd),
                        userId = reader.GetInt32(userIdOrd),
                        subject = details.ContainsKey("subject") ? details["subject"].GetString() : null,
                        message = details.ContainsKey("message") ? details["message"].GetString() : null,
                        read = details.ContainsKey("read") && details["read"].GetBoolean(),
                        createdAt = reader.GetDateTime(createdOrd).ToString("yyyy-MM-ddTHH:mm:ss")
                    });
                }

                return Ok(messages);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpGet("unread")]
        public async Task<IActionResult> GetUnreadMessages()
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                using var cmd = new MySqlCommand(
                    "SELECT id, user_id, action, details, created_at FROM audit_logs WHERE action = 'message' ORDER BY created_at DESC",
                    connection);

                var messages = new List<object>();
                using var reader = await cmd.ExecuteReaderAsync();
                
                while (await reader.ReadAsync())
                {
                    var detailsOrd = reader.GetOrdinal("details");
                    var detailsJson = reader.IsDBNull(detailsOrd) ? "{}" : reader.GetString(detailsOrd);
                    var details = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(detailsJson) ?? new Dictionary<string, JsonElement>();

                    var read = details.ContainsKey("read") && details["read"].GetBoolean();
                    if (!read)
                    {
                        messages.Add(new
                        {
                            id = reader.GetInt32("id"),
                            userId = reader.GetInt32("user_id"),
                            subject = details.ContainsKey("subject") ? details["subject"].GetString() : null,
                            message = details.ContainsKey("message") ? details["message"].GetString() : null,
                            read = false,
                            createdAt = reader.GetDateTime("created_at").ToString("yyyy-MM-ddTHH:mm:ss")
                        });
                    }
                }

                return Ok(messages);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }
        }

        [HttpPut("{id}/read")]
        public async Task<IActionResult> MarkMessageRead(int id)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                // Get existing details
                using var getCmd = new MySqlCommand(
                    "SELECT details FROM audit_logs WHERE id = @id",
                    connection);
                getCmd.Parameters.AddWithValue("@id", id);
                
                var detailsJson = await getCmd.ExecuteScalarAsync() as string;
                if (string.IsNullOrEmpty(detailsJson))
                {
                    return NotFound(new { message = "Message not found" });
                }

                var details = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(detailsJson) ?? new Dictionary<string, JsonElement>();
                details["read"] = JsonSerializer.SerializeToElement(true);
                var updatedDetails = JsonSerializer.Serialize(details);

                // Update message
                using var updateCmd = new MySqlCommand(
                    "UPDATE audit_logs SET details = @details WHERE id = @id",
                    connection);
                updateCmd.Parameters.AddWithValue("@details", updatedDetails);
                updateCmd.Parameters.AddWithValue("@id", id);
                await updateCmd.ExecuteNonQueryAsync();

                return Ok(new { message = "Message marked as read" });
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

    public class CreateMessageRequest
    {
        public int UserId { get; set; }
        public string Subject { get; set; } = "";
        public string Message { get; set; } = "";
        public int? ToUserId { get; set; }
    }
}

