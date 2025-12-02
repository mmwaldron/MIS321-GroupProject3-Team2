using Microsoft.AspNetCore.Mvc;
using MIS321_GroupProject3_Team2.Services;
using MySqlConnector;
using System.Text.Json;

namespace MIS321_GroupProject3_Team2.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class NvdController : ControllerBase
    {
        private readonly NvdIngestService _nvdIngestService;
        private readonly string _connectionString;

        public NvdController(NvdIngestService nvdIngestService, IConfiguration configuration)
        {
            _nvdIngestService = nvdIngestService;
            var configConn = configuration.GetConnectionString("DefaultConnection");
            if (string.IsNullOrEmpty(configConn) || configConn == "${JAWSDB_URL}")
            {
                configConn = null;
            }
            _connectionString = configConn 
                ?? Environment.GetEnvironmentVariable("JAWSDB_URL") 
                ?? "mysql://rafzxyujgowd9c4f:u40pss81sz1ub6t8@durvbryvdw2sjcm5.cbetxkdyhwsb.us-east-1.rds.amazonaws.com:3306/p14kvqervonda4dv";
        }

        [HttpPost("ingest")]
        public async Task<IActionResult> Ingest()
        {
            try
            {
                var ingested = await _nvdIngestService.IngestNvdDataAsync();
                return Ok(new { status = "ok", ingested = ingested });
            }
            catch (Exception ex)
            {
                // Log the full exception for debugging
                Console.WriteLine($"NVD Ingestion Error: {ex}");
                Console.WriteLine($"Stack Trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Inner Exception: {ex.InnerException.Message}");
                }
                
                return StatusCode(500, new { 
                    status = "error", 
                    message = ex.Message,
                    details = ex.InnerException?.Message
                });
            }
        }
    }

    [ApiController]
    [Route("api/alerts")]
    public class AlertsController : ControllerBase
    {
        private readonly string _connectionString;

        public AlertsController(IConfiguration configuration)
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

        [HttpGet("top")]
        public async Task<IActionResult> GetTopAlerts()
        {
            try
            {
                // Parse connection string if needed
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                // Get total count
                using var countCmd = new MySqlCommand("SELECT COUNT(*) FROM alerts_scored", connection);
                var totalCount = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
                
                if (totalCount == 0)
                {
                    return Ok(new List<object>());
                }

                // Calculate limit (top 20%)
                var limit = (int)Math.Ceiling(totalCount * 0.2);

                // Get top alerts sorted by trust_score DESC
                using var selectCmd = new MySqlCommand(
                    "SELECT cve_id, description, cvss_score, bio_relevance_score, risk_score, trust_score, tier, processed_at FROM alerts_scored ORDER BY trust_score DESC LIMIT @limit",
                    connection);
                selectCmd.Parameters.AddWithValue("@limit", limit);

                using var reader = await selectCmd.ExecuteReaderAsync();
                var alerts = new List<object>();

                while (await reader.ReadAsync())
                {
                    var cveOrd = reader.GetOrdinal("cve_id");
                    var descOrd = reader.GetOrdinal("description");
                    var cvssOrd = reader.GetOrdinal("cvss_score");
                    var bioOrd = reader.GetOrdinal("bio_relevance_score");
                    var riskOrd = reader.GetOrdinal("risk_score");
                    var trustOrd = reader.GetOrdinal("trust_score");
                    var tierOrd = reader.GetOrdinal("tier");
                    var procOrd = reader.GetOrdinal("processed_at");

                    alerts.Add(new
                    {
                        cve_id = reader.GetString(cveOrd),
                        description = reader.IsDBNull(descOrd) ? null : reader.GetString(descOrd),
                        cvss_score = reader.IsDBNull(cvssOrd) ? (float?)null : reader.GetFloat(cvssOrd),
                        bio_relevance_score = reader.IsDBNull(bioOrd) ? (float?)null : reader.GetFloat(bioOrd),
                        risk_score = reader.IsDBNull(riskOrd) ? (float?)null : reader.GetFloat(riskOrd),
                        trust_score = reader.IsDBNull(trustOrd) ? (float?)null : reader.GetFloat(trustOrd),
                        tier = reader.IsDBNull(tierOrd) ? null : reader.GetString(tierOrd),
                        processed_at = reader.IsDBNull(procOrd) ? null : reader.GetDateTime(procOrd).ToString("yyyy-MM-dd HH:mm:ss")
                    });
                }

                return Ok(alerts);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        [HttpGet("unread")]
        public async Task<IActionResult> GetUnreadAlerts()
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                using var cmd = new MySqlCommand(
                    "SELECT id, user_id, action, details, created_at FROM audit_logs WHERE action LIKE '%alert%' ORDER BY created_at DESC",
                    connection);

                var alerts = new List<object>();
                using var reader = await cmd.ExecuteReaderAsync();
                
                while (await reader.ReadAsync())
                {
                    var detailsOrd = reader.GetOrdinal("details");
                    var idOrd = reader.GetOrdinal("id");
                    var userIdOrd = reader.GetOrdinal("user_id");
                    var createdAtOrd = reader.GetOrdinal("created_at");

                    var detailsJson = reader.IsDBNull(detailsOrd) ? "{}" : reader.GetString(detailsOrd);
                    var details = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(detailsJson) ?? new Dictionary<string, JsonElement>();

                    var read = details.ContainsKey("read") && details["read"].GetBoolean();
                    if (!read)
                    {
                        alerts.Add(new
                        {
                            id = reader.GetInt32(idOrd),
                            userId = reader.IsDBNull(userIdOrd) ? null : (int?)reader.GetInt32(userIdOrd),
                            type = details.ContainsKey("type") ? details["type"].GetString() : null,
                            title = details.ContainsKey("title") ? details["title"].GetString() : null,
                            message = details.ContainsKey("message") ? details["message"].GetString() : null,
                            priority = details.ContainsKey("priority") ? details["priority"].GetString() : "medium",
                            read = false,
                            createdAt = reader.GetDateTime(createdAtOrd).ToString("yyyy-MM-ddTHH:mm:ss")
                        });
                    }
                }

                return Ok(alerts);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        [HttpPut("{id}/read")]
        public async Task<IActionResult> MarkAlertRead(int id)
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
                
                var detailsJson = await getCmd.ExecuteScalarAsync() as string ?? "{}";
                if (string.IsNullOrEmpty(detailsJson))
                {
                    return NotFound(new { message = "Alert not found" });
                }

                var details = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(detailsJson) ?? new Dictionary<string, JsonElement>();
                details["read"] = JsonSerializer.SerializeToElement(true);
                var updatedDetails = JsonSerializer.Serialize(details);

                // Update alert
                using var updateCmd = new MySqlCommand(
                    "UPDATE audit_logs SET details = @details WHERE id = @id",
                    connection);
                updateCmd.Parameters.AddWithValue("@details", updatedDetails);
                updateCmd.Parameters.AddWithValue("@id", id);
                await updateCmd.ExecuteNonQueryAsync();

                return Ok(new { message = "Alert marked as read" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        [HttpPost]
        public async Task<IActionResult> CreateAlert([FromBody] CreateAlertRequest request)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);

                using var connection = new MySqlConnection(connString);
                await connection.OpenAsync();

                var details = JsonSerializer.Serialize(new
                {
                    type = request.Type,
                    title = request.Title,
                    message = request.Message,
                    priority = request.Priority,
                    read = false
                });

                using var cmd = new MySqlCommand(
                    "INSERT INTO audit_logs (user_id, action, details) VALUES (@user_id, @action, @details)",
                    connection);
                cmd.Parameters.AddWithValue("@user_id", request.UserId);
                cmd.Parameters.AddWithValue("@action", $"alert_{request.Type}");
                cmd.Parameters.AddWithValue("@details", details);
                
                await cmd.ExecuteNonQueryAsync();
                var alertId = (int)cmd.LastInsertedId;

                return Ok(new { 
                    id = alertId,
                    userId = request.UserId
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        private static string ParseConnectionString(string connectionString)
        {
            if (connectionString.StartsWith("mysql://"))
            {
                return ParseJawsDbUrl(connectionString);
            }
            return connectionString;
        }

        private static string ParseJawsDbUrl(string jawsDbUrl)
        {
            // JAWSDB_URL format: mysql://user:pass@host:port/db
            var uri = new Uri(jawsDbUrl.Replace("mysql://", "http://"));
            var userInfo = uri.UserInfo.Split(':');
            var database = uri.AbsolutePath.TrimStart('/');
            
            return $"Server={uri.Host};Database={database};User={userInfo[0]};Password={userInfo[1]};Port={uri.Port};";
        }
    }

    public class CreateAlertRequest
    {
        public int? UserId { get; set; }
        public string Type { get; set; } = "";
        public string Title { get; set; } = "";
        public string Message { get; set; } = "";
        public string Priority { get; set; } = "medium";
    }
}

