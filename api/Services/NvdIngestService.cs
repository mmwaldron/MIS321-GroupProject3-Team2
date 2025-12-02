using System.Text.Json;
using System.Linq;
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
            // Validate connection string
            if (string.IsNullOrEmpty(_connectionString))
            {
                throw new InvalidOperationException("Database connection string is not configured");
            }

            // Parse connection string if needed
            var connString = ParseConnectionString(_connectionString);
            
            if (string.IsNullOrEmpty(connString))
            {
                throw new InvalidOperationException("Failed to parse database connection string");
            }

            // Fetch NVD JSON feed with pagination (limit to first 200 CVEs for efficiency)
            // You can increase resultsPerPage up to 2000, but start smaller for testing
            var resultsPerPage = 200;
            var startIndex = 0;
            var nvdUrl = $"https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage={resultsPerPage}&startIndex={startIndex}";
            
            Console.WriteLine($"Fetching NVD data from: {nvdUrl}");
            var response = await _httpClient.GetStringAsync(nvdUrl);
            
            // Parse JSON
            var jsonDoc = JsonDocument.Parse(response);
            var root = jsonDoc.RootElement;
            
            if (!root.TryGetProperty("vulnerabilities", out var vulnerabilities))
            {
                Console.WriteLine("No vulnerabilities found in NVD response");
                return 0;
            }

            var totalResults = root.TryGetProperty("totalResults", out var totalResultsElement) 
                ? totalResultsElement.GetInt32() 
                : 0;
            Console.WriteLine($"Total CVEs available: {totalResults}, Processing: {vulnerabilities.GetArrayLength()}");

            var ingestedCount = 0;
            var skippedCount = 0;

            using var connection = new MySqlConnection(connString);
            await connection.OpenAsync();

            // First, get all existing CVE IDs in bulk to avoid individual queries
            Console.WriteLine("Checking for existing CVEs...");
            var existingRawCves = new HashSet<string>();
            var existingScoredCves = new HashSet<string>();
            
            using var getExistingRawCmd = new MySqlCommand("SELECT cve_id FROM alerts_raw", connection);
            using var rawReader = await getExistingRawCmd.ExecuteReaderAsync();
            while (await rawReader.ReadAsync())
            {
                existingRawCves.Add(rawReader.GetString(0));
            }
            rawReader.Close();
            
            using var getExistingScoredCmd = new MySqlCommand("SELECT cve_id FROM alerts_scored", connection);
            using var scoredReader = await getExistingScoredCmd.ExecuteReaderAsync();
            while (await scoredReader.ReadAsync())
            {
                existingScoredCves.Add(scoredReader.GetString(0));
            }
            scoredReader.Close();
            
            Console.WriteLine($"Found {existingRawCves.Count} existing raw CVEs, {existingScoredCves.Count} existing scored CVEs");

            // Process CVEs - collect data first, then batch insert
            var rawCvesToInsert = new List<(string cveId, string rawJson)>();
            var scoredCvesToInsert = new List<(string cveId, string description, float cvssScore, float bioRelevanceScore, float riskScore, float trustScore, string tier)>();
            
            var processed = 0;
            var vulnCount = vulnerabilities.GetArrayLength();
            
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

                processed++;
                if (processed % 50 == 0)
                {
                    Console.WriteLine($"Processed {processed}/{vulnCount} CVEs...");
                }

                // Check if CVE already exists (using HashSet for O(1) lookup)
                if (existingRawCves.Contains(cveId))
                {
                    skippedCount++;
                    continue; // Skip duplicates
                }

                // Collect raw JSON
                var rawJson = vuln.GetRawText();
                rawCvesToInsert.Add((cveId, rawJson));
                existingRawCves.Add(cveId); // Track to avoid duplicates in same batch

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

                // Determine tier based on trust_score
                string tier = "green";
                if (trustScore >= 7.0f)
                {
                    tier = "red";
                }
                else if (trustScore >= 4.0f)
                {
                    tier = "yellow";
                }

                // Check if already exists in alerts_scored (using HashSet for O(1) lookup)
                if (!existingScoredCves.Contains(cveId))
                {
                    scoredCvesToInsert.Add((cveId, description, cvssScore, bioRelevanceScore, riskScore, trustScore, tier));
                    existingScoredCves.Add(cveId); // Track to avoid duplicates
                }
            }

            // Batch insert raw CVEs
            if (rawCvesToInsert.Count > 0)
            {
                Console.WriteLine($"Batch inserting {rawCvesToInsert.Count} raw CVEs...");
                const int batchSize = 50; // Insert 50 at a time to avoid huge queries
                for (int i = 0; i < rawCvesToInsert.Count; i += batchSize)
                {
                    var batch = rawCvesToInsert.Skip(i).Take(batchSize).ToList();
                    var values = string.Join(", ", batch.Select((_, idx) => $"(@cve_id_{i + idx}, @raw_json_{i + idx})"));
                    var sql = $"INSERT INTO alerts_raw (cve_id, raw_json) VALUES {values}";
                    
                    using var batchCmd = new MySqlCommand(sql, connection);
                    for (int j = 0; j < batch.Count; j++)
                    {
                        batchCmd.Parameters.AddWithValue($"@cve_id_{i + j}", batch[j].cveId);
                        batchCmd.Parameters.AddWithValue($"@raw_json_{i + j}", batch[j].rawJson);
                    }
                    await batchCmd.ExecuteNonQueryAsync();
                }
                Console.WriteLine($"Inserted {rawCvesToInsert.Count} raw CVEs");
            }

            // Batch insert scored CVEs
            if (scoredCvesToInsert.Count > 0)
            {
                Console.WriteLine($"Batch inserting {scoredCvesToInsert.Count} scored CVEs...");
                const int batchSize = 50; // Insert 50 at a time
                for (int i = 0; i < scoredCvesToInsert.Count; i += batchSize)
                {
                    var batch = scoredCvesToInsert.Skip(i).Take(batchSize).ToList();
                    var values = string.Join(", ", batch.Select((_, idx) => 
                        $"(@cve_id_{i + idx}, @description_{i + idx}, @cvss_score_{i + idx}, @bio_relevance_score_{i + idx}, @risk_score_{i + idx}, @trust_score_{i + idx}, @tier_{i + idx})"));
                    var sql = $"INSERT INTO alerts_scored (cve_id, description, cvss_score, bio_relevance_score, risk_score, trust_score, tier) VALUES {values}";
                    
                    using var batchCmd = new MySqlCommand(sql, connection);
                    for (int j = 0; j < batch.Count; j++)
                    {
                        var item = batch[j];
                        batchCmd.Parameters.AddWithValue($"@cve_id_{i + j}", item.cveId);
                        batchCmd.Parameters.AddWithValue($"@description_{i + j}", item.description);
                        batchCmd.Parameters.AddWithValue($"@cvss_score_{i + j}", item.cvssScore);
                        batchCmd.Parameters.AddWithValue($"@bio_relevance_score_{i + j}", item.bioRelevanceScore);
                        batchCmd.Parameters.AddWithValue($"@risk_score_{i + j}", item.riskScore);
                        batchCmd.Parameters.AddWithValue($"@trust_score_{i + j}", item.trustScore);
                        batchCmd.Parameters.AddWithValue($"@tier_{i + j}", item.tier);
                    }
                    await batchCmd.ExecuteNonQueryAsync();
                }
                ingestedCount = scoredCvesToInsert.Count;
                Console.WriteLine($"Inserted {scoredCvesToInsert.Count} scored CVEs");
            }

            Console.WriteLine($"Ingestion complete: {ingestedCount} new CVEs ingested, {skippedCount} skipped (duplicates)");
            return ingestedCount;
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
            try
            {
                if (string.IsNullOrEmpty(jawsDbUrl))
                {
                    throw new ArgumentException("Connection string is null or empty");
                }

                // Replace mysql:// with http:// for URI parsing
                var httpUrl = jawsDbUrl.Replace("mysql://", "http://");
                var uri = new Uri(httpUrl);
                
                // Extract user info
                var userInfo = uri.UserInfo;
                if (string.IsNullOrEmpty(userInfo))
                {
                    throw new ArgumentException("Connection string missing user credentials");
                }
                
                var userInfoParts = userInfo.Split(':');
                if (userInfoParts.Length < 2)
                {
                    throw new ArgumentException($"Invalid connection string format: user info '{userInfo}' is malformed. Expected format: user:password");
                }
                
                var username = userInfoParts[0];
                var password = string.Join(":", userInfoParts.Skip(1)); // Handle passwords with colons
                var database = uri.AbsolutePath.TrimStart('/');
                
                if (string.IsNullOrEmpty(username))
                {
                    throw new ArgumentException("Connection string has empty username");
                }
                
                if (string.IsNullOrEmpty(database))
                {
                    throw new ArgumentException("Connection string missing database name");
                }
                
                var port = uri.Port > 0 ? uri.Port : 3306; // Default MySQL port
                
                return $"Server={uri.Host};Database={database};User={username};Password={password};Port={port};";
            }
            catch (Exception ex)
            {
                throw new ArgumentException($"Failed to parse connection string '{jawsDbUrl}': {ex.Message}", ex);
            }
        }
    }
}

