using System.Text.Json;
using MySqlConnector;

namespace MIS321_GroupProject3_Team2.Services
{
    public class NvdIngestService
    {
        private readonly string _connectionString;
        private readonly HttpClient _httpClient;

        public NvdIngestService(string connectionString)
        {
            _connectionString = connectionString;
            _httpClient = new HttpClient();
        }

        public async Task<int> IngestNvdDataAsync()
        {
            // Parse connection string if needed
            var connString = _connectionString;
            if (connString.StartsWith("mysql://"))
            {
                connString = ParseJawsDbUrl(connString);
            }

            // Fetch NVD JSON feed
            var nvdUrl = "https://services.nvd.nist.gov/rest/json/cves/2.0";
            var response = await _httpClient.GetStringAsync(nvdUrl);
            
            // Parse JSON
            var jsonDoc = JsonDocument.Parse(response);
            var root = jsonDoc.RootElement;
            
            if (!root.TryGetProperty("vulnerabilities", out var vulnerabilities))
            {
                return 0;
            }

            var ingestedCount = 0;

            using var connection = new MySqlConnection(connString);
            await connection.OpenAsync();

            foreach (var vuln in vulnerabilities.EnumerateArray())
            {
                if (!vuln.TryGetProperty("cve", out var cve))
                {
                    continue;
                }

                // Extract CVE ID
                if (!cve.TryGetProperty("id", out var cveIdElement))
                {
                    continue;
                }

                var cveId = cveIdElement.GetString();
                if (string.IsNullOrEmpty(cveId))
                {
                    continue;
                }

                // Check if CVE already exists
                using var checkCmd = new MySqlCommand(
                    "SELECT COUNT(*) FROM alerts_raw WHERE cve_id = @cve_id",
                    connection);
                checkCmd.Parameters.AddWithValue("@cve_id", cveId);
                
                var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;
                if (exists)
                {
                    continue; // Skip duplicates
                }

                // Insert raw JSON into alerts_raw
                var rawJson = vuln.GetRawText();
                using var insertRawCmd = new MySqlCommand(
                    "INSERT INTO alerts_raw (cve_id, raw_json) VALUES (@cve_id, @raw_json)",
                    connection);
                insertRawCmd.Parameters.AddWithValue("@cve_id", cveId);
                insertRawCmd.Parameters.AddWithValue("@raw_json", rawJson);
                await insertRawCmd.ExecuteNonQueryAsync();

                // Extract description
                var description = "";
                if (cve.TryGetProperty("descriptions", out var descriptions) && 
                    descriptions.ValueKind == JsonValueKind.Array && 
                    descriptions.GetArrayLength() > 0)
                {
                    var firstDesc = descriptions[0];
                    if (firstDesc.TryGetProperty("value", out var descValue))
                    {
                        description = descValue.GetString() ?? "";
                    }
                }

                // Extract CVSS score
                float cvssScore = 0.0f;
                if (cve.TryGetProperty("metrics", out var metrics))
                {
                    // Try CVSS v3.1 first
                    if (metrics.TryGetProperty("cvssMetricV31", out var cvssV31) && 
                        cvssV31.ValueKind == JsonValueKind.Array && 
                        cvssV31.GetArrayLength() > 0)
                    {
                        var firstMetric = cvssV31[0];
                        if (firstMetric.TryGetProperty("cvssData", out var cvssData))
                        {
                            if (cvssData.TryGetProperty("baseScore", out var baseScore))
                            {
                                cvssScore = (float)baseScore.GetDouble();
                            }
                        }
                    }
                    // Fallback to CVSS v3.0
                    else if (metrics.TryGetProperty("cvssMetricV30", out var cvssV30) && 
                             cvssV30.ValueKind == JsonValueKind.Array && 
                             cvssV30.GetArrayLength() > 0)
                    {
                        var firstMetric = cvssV30[0];
                        if (firstMetric.TryGetProperty("cvssData", out var cvssData))
                        {
                            if (cvssData.TryGetProperty("baseScore", out var baseScore))
                            {
                                cvssScore = (float)baseScore.GetDouble();
                            }
                        }
                    }
                    // Fallback to CVSS v2
                    else if (metrics.TryGetProperty("cvssMetricV2", out var cvssV2) && 
                             cvssV2.ValueKind == JsonValueKind.Array && 
                             cvssV2.GetArrayLength() > 0)
                    {
                        var firstMetric = cvssV2[0];
                        if (firstMetric.TryGetProperty("cvssData", out var cvssData))
                        {
                            if (cvssData.TryGetProperty("baseScore", out var baseScore))
                            {
                                cvssScore = (float)baseScore.GetDouble();
                            }
                        }
                    }
                }

                // Compute scores (placeholders as specified)
                float bioRelevanceScore = 0.0f;
                float riskScore = cvssScore;
                float trustScore = cvssScore * 0.95f;

                // Check if already exists in alerts_scored
                using var checkScoredCmd = new MySqlCommand(
                    "SELECT COUNT(*) FROM alerts_scored WHERE cve_id = @cve_id",
                    connection);
                checkScoredCmd.Parameters.AddWithValue("@cve_id", cveId);
                
                var existsScored = Convert.ToInt32(await checkScoredCmd.ExecuteScalarAsync()) > 0;
                if (!existsScored)
                {
                    // Insert scored entry
                    using var insertScoredCmd = new MySqlCommand(
                        "INSERT INTO alerts_scored (cve_id, description, cvss_score, bio_relevance_score, risk_score, trust_score) VALUES (@cve_id, @description, @cvss_score, @bio_relevance_score, @risk_score, @trust_score)",
                        connection);
                    insertScoredCmd.Parameters.AddWithValue("@cve_id", cveId);
                    insertScoredCmd.Parameters.AddWithValue("@description", description);
                    insertScoredCmd.Parameters.AddWithValue("@cvss_score", cvssScore);
                    insertScoredCmd.Parameters.AddWithValue("@bio_relevance_score", bioRelevanceScore);
                    insertScoredCmd.Parameters.AddWithValue("@risk_score", riskScore);
                    insertScoredCmd.Parameters.AddWithValue("@trust_score", trustScore);
                    await insertScoredCmd.ExecuteNonQueryAsync();
                }

                ingestedCount++;
            }

            return ingestedCount;
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
}

