using System.Text.Json;
using MySqlConnector;

namespace MIS321_GroupProject3_Team2.Services
{
    public class RiskAnalysisService
    {
        private readonly string _connectionString;

        public RiskAnalysisService(IConfiguration configuration)
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

        public RiskAnalysisResult AnalyzeVerification(Dictionary<string, JsonElement> verificationData)
        {
            var result = new RiskAnalysisResult
            {
                OverallRiskScore = 0,
                RiskLevel = "low",
                Flags = new List<RiskFlag>(),
                Recommendations = new List<string>()
            };

            // 1. Email Analysis
            var emailRisk = AnalyzeEmail(verificationData);
            result.Flags.AddRange(emailRisk.Flags);
            result.OverallRiskScore += emailRisk.Score;

            // 2. Government ID Analysis
            var govIdRisk = AnalyzeGovernmentId(verificationData);
            result.Flags.AddRange(govIdRisk.Flags);
            result.OverallRiskScore += govIdRisk.Score;

            // 3. Document Verification
            var docRisk = AnalyzeDocument(verificationData);
            result.Flags.AddRange(docRisk.Flags);
            result.OverallRiskScore += docRisk.Score;

            // 4. Pattern Analysis
            var patternRisk = AnalyzePatterns(verificationData);
            result.Flags.AddRange(patternRisk.Flags);
            result.OverallRiskScore += patternRisk.Score;

            // 5. Cross-Reference Check
            var crossRefRisk = CheckCrossReferences(verificationData);
            result.Flags.AddRange(crossRefRisk.Flags);
            result.OverallRiskScore += crossRefRisk.Score;

            // 6. Behavioral Analysis
            var behaviorRisk = AnalyzeBehavior(verificationData);
            result.Flags.AddRange(behaviorRisk.Flags);
            result.OverallRiskScore += behaviorRisk.Score;

            // Normalize score
            result.OverallRiskScore = Math.Min(100, Math.Max(0, result.OverallRiskScore));
            result.RiskLevel = GetRiskLevel(result.OverallRiskScore);

            // Generate recommendations
            result.Recommendations = GenerateRecommendations(result.Flags);

            return result;
        }

        private RiskAnalysisComponent AnalyzeEmail(Dictionary<string, JsonElement> data)
        {
            var component = new RiskAnalysisComponent { Score = 0, Flags = new List<RiskFlag>() };

            if (!data.ContainsKey("email")) return component;

            var email = data["email"].GetString() ?? "";
            var domain = email.Split('@').Length > 1 ? email.Split('@')[1].ToLower() : "";

            // Suspicious domains
            var suspiciousDomains = new[] { "tempmail", "throwaway", "10minutemail", "guerrillamail", "mailinator" };
            if (suspiciousDomains.Any(d => domain.Contains(d)))
            {
                component.Score += 25;
                component.Flags.Add(new RiskFlag
                {
                    Type = "email_domain",
                    Severity = "high",
                    Message = $"Suspicious email domain detected: {domain}",
                    Impact = "Temporary email services are often used for fraudulent accounts"
                });
            }

            // Free email providers (lower risk but worth noting)
            var freeProviders = new[] { "gmail.com", "yahoo.com", "hotmail.com", "outlook.com" };
            if (freeProviders.Contains(domain))
            {
                component.Score += 5;
                component.Flags.Add(new RiskFlag
                {
                    Type = "email_provider",
                    Severity = "low",
                    Message = $"Free email provider: {domain}",
                    Impact = "Less verifiable than corporate/educational emails"
                });
            }

            // Email verification status
            if (data.ContainsKey("emailVerified"))
            {
                var emailVerified = data["emailVerified"].ValueKind == JsonValueKind.True && 
                                   data["emailVerified"].GetBoolean();
                if (!emailVerified)
                {
                    component.Score += 15;
                    component.Flags.Add(new RiskFlag
                    {
                        Type = "email_verification",
                        Severity = "medium",
                        Message = "Email address not verified",
                        Impact = "Cannot confirm user owns this email address"
                    });
                }
            }

            return component;
        }

        private RiskAnalysisComponent AnalyzeGovernmentId(Dictionary<string, JsonElement> data)
        {
            var component = new RiskAnalysisComponent { Score = 0, Flags = new List<RiskFlag>() };

            if (!data.ContainsKey("govId")) return component;

            var govId = data["govId"].GetString() ?? "";

            // Missing or too short
            if (string.IsNullOrWhiteSpace(govId) || govId.Length < 4)
            {
                component.Score += 30;
                component.Flags.Add(new RiskFlag
                {
                    Type = "gov_id_missing",
                    Severity = "high",
                    Message = "Government ID missing or incomplete",
                    Impact = "Cannot verify user identity without valid ID"
                });
                return component;
            }

            // Only last 4 digits provided (common pattern)
            if (govId.Length == 4 && govId.All(char.IsDigit))
            {
                component.Score += 10;
                component.Flags.Add(new RiskFlag
                {
                    Type = "gov_id_partial",
                    Severity = "medium",
                    Message = "Only partial government ID provided (last 4 digits)",
                    Impact = "Limited verification capability with partial ID"
                });
            }

            // Suspicious patterns
            if (govId.Length > 0 && govId.All(c => c == govId[0])) // All same character
            {
                component.Score += 20;
                component.Flags.Add(new RiskFlag
                {
                    Type = "gov_id_pattern",
                    Severity = "high",
                    Message = "Suspicious ID pattern detected",
                    Impact = "ID appears to be fake or placeholder"
                });
            }

            return component;
        }

        private RiskAnalysisComponent AnalyzeDocument(Dictionary<string, JsonElement> data)
        {
            var component = new RiskAnalysisComponent { Score = 0, Flags = new List<RiskFlag>() };

            var hasDocument = data.ContainsKey("hasDocument") && 
                             data["hasDocument"].ValueKind == JsonValueKind.True && 
                             data["hasDocument"].GetBoolean();

            if (!hasDocument)
            {
                component.Score += 20;
                component.Flags.Add(new RiskFlag
                {
                    Type = "document_missing",
                    Severity = "high",
                    Message = "No verification document uploaded",
                    Impact = "Cannot verify identity without supporting documentation"
                });
            }
            else
            {
                // Check for document analysis results if available
                if (data.ContainsKey("documentAnalysis"))
                {
                    try
                    {
                        var docAnalysisJson = data["documentAnalysis"];
                        if (docAnalysisJson.ValueKind == JsonValueKind.Object)
                        {
                            var riskScore = docAnalysisJson.TryGetProperty("riskScore", out var riskScoreProp) 
                                ? riskScoreProp.GetDouble() 
                                : 0;
                            var riskLevel = docAnalysisJson.TryGetProperty("riskLevel", out var riskLevelProp) 
                                ? riskLevelProp.GetString() ?? "low" 
                                : "low";

                            if (riskScore > 50)
                            {
                                component.Score += 15;
                                component.Flags.Add(new RiskFlag
                                {
                                    Type = "document_high_risk",
                                    Severity = "high",
                                    Message = $"Document has high risk score: {riskScore:F1}",
                                    Impact = "Document may be fraudulent or manipulated"
                                });
                            }
                            else if (riskScore > 25)
                            {
                                component.Score += 5;
                                component.Flags.Add(new RiskFlag
                                {
                                    Type = "document_medium_risk",
                                    Severity = "medium",
                                    Message = $"Document has medium risk score: {riskScore:F1}",
                                    Impact = "Document should be reviewed carefully"
                                });
                            }
                        }
                    }
                    catch
                    {
                        // Document analysis parsing failed - minor risk
                        component.Score += 5;
                    }
                }

                // Check for ID analysis results if available
                if (data.ContainsKey("idAnalysis"))
                {
                    try
                    {
                        var idAnalysisJson = data["idAnalysis"];
                        if (idAnalysisJson.ValueKind == JsonValueKind.Object)
                        {
                            var isValid = idAnalysisJson.TryGetProperty("isValid", out var isValidProp) 
                                && isValidProp.GetBoolean();
                            var riskScore = idAnalysisJson.TryGetProperty("riskScore", out var riskScoreProp) 
                                ? riskScoreProp.GetDouble() 
                                : 0;

                            if (!isValid)
                            {
                                component.Score += 20;
                                component.Flags.Add(new RiskFlag
                                {
                                    Type = "id_validation_failed",
                                    Severity = "high",
                                    Message = "Government ID validation failed",
                                    Impact = "ID does not meet validation requirements"
                                });
                            }

                            if (riskScore > 50)
                            {
                                component.Score += 15;
                                component.Flags.Add(new RiskFlag
                                {
                                    Type = "id_high_risk",
                                    Severity = "high",
                                    Message = $"ID has high risk score: {riskScore:F1}",
                                    Impact = "ID may be fraudulent or invalid"
                                });
                            }
                        }
                    }
                    catch
                    {
                        // ID analysis parsing failed - minor risk
                        component.Score += 5;
                    }
                }

                component.Flags.Add(new RiskFlag
                {
                    Type = "document_uploaded",
                    Severity = "info",
                    Message = "Verification document provided",
                    Impact = "Positive: User provided supporting documentation"
                });
            }

            return component;
        }

        private RiskAnalysisComponent AnalyzePatterns(Dictionary<string, JsonElement> data)
        {
            var component = new RiskAnalysisComponent { Score = 0, Flags = new List<RiskFlag>() };

            var name = data.ContainsKey("name") ? data["name"].GetString() ?? "" : "";
            var email = data.ContainsKey("email") ? data["email"].GetString() ?? "" : "";

            // Repeated characters
            if (name.Length > 0 && name.Distinct().Count() < 3)
            {
                component.Score += 15;
                component.Flags.Add(new RiskFlag
                {
                    Type = "name_pattern",
                    Severity = "medium",
                    Message = "Suspicious name pattern (repeated characters)",
                    Impact = "Name appears to be fake or placeholder"
                });
            }

            // Sequential patterns
            if (name.Contains("123") || name.Contains("abc") || name.ToLower().Contains("test"))
            {
                component.Score += 20;
                component.Flags.Add(new RiskFlag
                {
                    Type = "name_test_pattern",
                    Severity = "high",
                    Message = "Test pattern detected in name",
                    Impact = "Name appears to be a test account"
                });
            }

            // Email-name mismatch
            if (!string.IsNullOrEmpty(email) && email.Contains('@'))
            {
                var emailName = email.Split('@')[0].ToLower();
                var nameParts = name.ToLower().Split(' ');
                if (nameParts.Length > 0 && nameParts[0].Length >= 3 && !emailName.Contains(nameParts[0].Substring(0, Math.Min(3, nameParts[0].Length))))
                {
                    component.Score += 10;
                    component.Flags.Add(new RiskFlag
                    {
                        Type = "email_name_mismatch",
                        Severity = "low",
                        Message = "Email address doesn't match name pattern",
                        Impact = "Possible identity mismatch"
                    });
                }
            }

            return component;
        }

        private RiskAnalysisComponent CheckCrossReferences(Dictionary<string, JsonElement> data)
        {
            var component = new RiskAnalysisComponent { Score = 0, Flags = new List<RiskFlag>() };

            // Check for duplicate emails in system
            var email = data.ContainsKey("email") ? data["email"].GetString() : "";
            if (!string.IsNullOrEmpty(email))
            {
                var duplicateCount = CheckDuplicateEmail(email);
                if (duplicateCount > 1)
                {
                    component.Score += 15;
                    component.Flags.Add(new RiskFlag
                    {
                        Type = "duplicate_email",
                        Severity = "medium",
                        Message = $"Email address used by {duplicateCount} accounts",
                        Impact = "Multiple accounts with same email may indicate fraud"
                    });
                }
            }

            return component;
        }

        private RiskAnalysisComponent AnalyzeBehavior(Dictionary<string, JsonElement> data)
        {
            var component = new RiskAnalysisComponent { Score = 0, Flags = new List<RiskFlag>() };

            // Check creation time patterns
            if (data.ContainsKey("createdAt"))
            {
                var createdAtStr = data["createdAt"].GetString();
                if (!string.IsNullOrEmpty(createdAtStr) && DateTime.TryParse(createdAtStr, out var createdAt))
                {
                    var hour = createdAt.Hour;

                    // Suspicious: very late night/early morning submissions
                    if (hour >= 2 && hour <= 5)
                    {
                        component.Score += 5;
                        component.Flags.Add(new RiskFlag
                        {
                            Type = "timing_pattern",
                            Severity = "low",
                            Message = "Verification submitted during unusual hours (2-5 AM)",
                            Impact = "May indicate automated or fraudulent activity"
                        });
                    }
                }
            }

            return component;
        }

        private int CheckDuplicateEmail(string email)
        {
            try
            {
                var connString = ParseConnectionString(_connectionString);
                using var connection = new MySqlConnection(connString);
                connection.Open();

                using var cmd = new MySqlCommand(
                    "SELECT COUNT(*) FROM users WHERE email = @email",
                    connection);
                cmd.Parameters.AddWithValue("@email", email);

                return Convert.ToInt32(cmd.ExecuteScalar());
            }
            catch
            {
                return 0;
            }
        }

        private string GetRiskLevel(double score)
        {
            if (score >= 70) return "high";
            if (score >= 40) return "medium";
            return "low";
        }

        private List<string> GenerateRecommendations(List<RiskFlag> flags)
        {
            var recommendations = new List<string>();

            var highRiskFlags = flags.Where(f => f.Severity == "high").ToList();
            if (highRiskFlags.Any())
            {
                recommendations.Add("HIGH RISK: Manual review required before approval");
                recommendations.Add($"Review {highRiskFlags.Count} high-severity risk flags");
            }

            if (flags.Any(f => f.Type == "document_missing"))
            {
                recommendations.Add("Request additional verification documents");
            }

            if (flags.Any(f => f.Type == "email_verification"))
            {
                recommendations.Add("Verify email ownership through additional means");
            }

            if (flags.Any(f => f.Type == "duplicate_email"))
            {
                recommendations.Add("Investigate duplicate email usage across accounts");
            }

            return recommendations;
        }

        private string ParseConnectionString(string connectionString)
        {
            // Your existing connection string parsing logic
            if (string.IsNullOrEmpty(connectionString)) return "";
            if (connectionString.StartsWith("mysql://"))
            {
                var uri = new Uri(connectionString);
                return $"Server={uri.Host};Port={uri.Port};Database={uri.AbsolutePath.TrimStart('/')};User Id={uri.UserInfo.Split(':')[0]};Password={uri.UserInfo.Split(':')[1]};";
            }
            return connectionString;
        }
    }

    public class RiskAnalysisResult
    {
        public double OverallRiskScore { get; set; }
        public string RiskLevel { get; set; } = "";
        public List<RiskFlag> Flags { get; set; } = new();
        public List<string> Recommendations { get; set; } = new();
    }

    public class RiskAnalysisComponent
    {
        public double Score { get; set; }
        public List<RiskFlag> Flags { get; set; } = new();
    }

    public class RiskFlag
    {
        public string Type { get; set; } = "";
        public string Severity { get; set; } = ""; // "info", "low", "medium", "high"
        public string Message { get; set; } = "";
        public string Impact { get; set; } = "";
    }
}

