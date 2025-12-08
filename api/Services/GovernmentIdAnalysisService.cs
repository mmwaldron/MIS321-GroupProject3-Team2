using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;

namespace MIS321_GroupProject3_Team2.Services
{
    public class GovernmentIdAnalysisService
    {
        public async Task<IdAnalysisResult> AnalyzeGovernmentId(
            string filePath, 
            string idType, 
            string fileName)
        {
            var result = new IdAnalysisResult
            {
                IdType = idType,
                FileName = fileName,
                Flags = new List<IdValidationFlag>(),
                RiskScore = 0,
                ExtractedFields = new Dictionary<string, string>()
            };

            // 1. Detect ID Type from Image/PDF (if not provided)
            if (string.IsNullOrEmpty(idType))
            {
                idType = DetectIdType(filePath);
                result.IdType = idType;
            }

            // 2. Extract text/data from ID using OCR (placeholder for now)
            var extractedData = await ExtractIdData(filePath, idType);
            result.ExtractedFields = extractedData;

            // 3. Validate based on ID type
            var validationResult = ValidateIdByType(idType, extractedData);
            result.Flags.AddRange(validationResult.Flags);
            result.RiskScore += validationResult.Score;

            // 4. Check for common fraud indicators
            var fraudCheck = CheckFraudIndicators(filePath, extractedData, idType);
            result.Flags.AddRange(fraudCheck.Flags);
            result.RiskScore += fraudCheck.Score;

            // 5. Verify ID format and structure
            var formatCheck = ValidateIdFormat(idType, extractedData);
            result.Flags.AddRange(formatCheck.Flags);
            result.RiskScore += formatCheck.Score;

            result.RiskScore = Math.Min(100, Math.Max(0, result.RiskScore));
            result.RiskLevel = GetRiskLevel(result.RiskScore);
            result.IsValid = result.RiskScore < 50 && !result.Flags.Any(f => f.Severity == "high");

            return result;
        }

        private string DetectIdType(string filePath)
        {
            // Simplified detection - in production, use OCR or ML services
            // For now, return "other" as default
            try
            {
                var fileName = Path.GetFileName(filePath).ToLower();
                if (fileName.Contains("driver") || fileName.Contains("dl"))
                    return "drivers_license";
                if (fileName.Contains("passport"))
                    return "passport";
                if (fileName.Contains("military") || fileName.Contains("dod"))
                    return "military_id";
                if (fileName.Contains("permanent") || fileName.Contains("green"))
                    return "permanent_resident";
                if (fileName.Contains("state") || fileName.Contains("id"))
                    return "state_id";
            }
            catch
            {
                // Detection failed
            }
            return "other";
        }

        private async Task<Dictionary<string, string>> ExtractIdData(string filePath, string idType)
        {
            var extracted = new Dictionary<string, string>();
            try
            {
                // Placeholder for OCR - in production, integrate Azure Computer Vision, Tesseract, etc.
                // For now, return empty dictionary
                // The OCR would extract fields based on ID type
                await Task.CompletedTask;
            }
            catch (Exception ex)
            {
                extracted["error"] = ex.Message;
            }
            return extracted;
        }

        private Dictionary<string, string> ExtractDriversLicenseFields(string ocrText)
        {
            var fields = new Dictionary<string, string>();
            
            // Extract name (common patterns)
            var nameMatch = Regex.Match(ocrText, @"(?:NAME|FN|FULL NAME)[\s:]+([A-Z\s,]+)", RegexOptions.IgnoreCase);
            if (nameMatch.Success)
                fields["name"] = nameMatch.Groups[1].Value.Trim();

            // Extract date of birth
            var dobMatch = Regex.Match(ocrText, @"(?:DOB|DATE OF BIRTH|BIRTH DATE)[\s:]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})", RegexOptions.IgnoreCase);
            if (dobMatch.Success)
                fields["dateOfBirth"] = dobMatch.Groups[1].Value.Trim();

            // Extract license number
            var licenseMatch = Regex.Match(ocrText, @"(?:DL|LIC|LICENSE|ID)[\s#:]+([A-Z0-9]{6,12})", RegexOptions.IgnoreCase);
            if (licenseMatch.Success)
                fields["idNumber"] = licenseMatch.Groups[1].Value.Trim();

            // Extract expiration date
            var expMatch = Regex.Match(ocrText, @"(?:EXP|EXPIRES|EXPIRATION)[\s:]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})", RegexOptions.IgnoreCase);
            if (expMatch.Success)
                fields["expirationDate"] = expMatch.Groups[1].Value.Trim();

            return fields;
        }

        private Dictionary<string, string> ExtractPassportFields(string ocrText)
        {
            var fields = new Dictionary<string, string>();
            
            // Passport number
            var passportMatch = Regex.Match(ocrText, @"(?:PASSPORT|PASSPORT NO|PASSPORT #)[\s:]+([A-Z0-9]{6,12})", RegexOptions.IgnoreCase);
            if (passportMatch.Success)
                fields["idNumber"] = passportMatch.Groups[1].Value.Trim();

            // Name
            var nameMatch = Regex.Match(ocrText, @"(?:SURNAME|GIVEN NAMES|NAME)[\s:]+([A-Z\s]+)", RegexOptions.IgnoreCase);
            if (nameMatch.Success)
                fields["name"] = nameMatch.Groups[1].Value.Trim();

            // Date of birth
            var dobMatch = Regex.Match(ocrText, @"(?:DATE OF BIRTH|DOB)[\s:]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})", RegexOptions.IgnoreCase);
            if (dobMatch.Success)
                fields["dateOfBirth"] = dobMatch.Groups[1].Value.Trim();

            return fields;
        }

        private Dictionary<string, string> ExtractStateIdFields(string ocrText)
        {
            return ExtractDriversLicenseFields(ocrText);
        }

        private Dictionary<string, string> ExtractMilitaryIdFields(string ocrText)
        {
            var fields = new Dictionary<string, string>();
            
            // EDIPI (10-digit number)
            var edipiMatch = Regex.Match(ocrText, @"(?:EDIPI|ID)[\s#:]+(\d{10})", RegexOptions.IgnoreCase);
            if (edipiMatch.Success)
                fields["idNumber"] = edipiMatch.Groups[1].Value.Trim();

            // Name
            var nameMatch = Regex.Match(ocrText, @"(?:NAME)[\s:]+([A-Z\s,]+)", RegexOptions.IgnoreCase);
            if (nameMatch.Success)
                fields["name"] = nameMatch.Groups[1].Value.Trim();

            return fields;
        }

        private Dictionary<string, string> ExtractGenericIdFields(string ocrText)
        {
            var fields = new Dictionary<string, string>();
            
            // Try to extract any ID number pattern
            var idMatch = Regex.Match(ocrText, @"(?:ID|NUMBER|#)[\s:]+([A-Z0-9]{6,15})", RegexOptions.IgnoreCase);
            if (idMatch.Success)
                fields["idNumber"] = idMatch.Groups[1].Value.Trim();

            return fields;
        }

        private ValidationResult ValidateIdByType(string idType, Dictionary<string, string> extractedData)
        {
            var result = new ValidationResult { Score = 0, Flags = new List<IdValidationFlag>() };
            
            switch (idType)
            {
                case "drivers_license":
                    result = ValidateDriversLicense(extractedData);
                    break;
                case "passport":
                    result = ValidatePassport(extractedData);
                    break;
                case "state_id":
                    result = ValidateStateId(extractedData);
                    break;
                case "military_id":
                    result = ValidateMilitaryId(extractedData);
                    break;
                default:
                    result = ValidateGenericId(extractedData);
                    break;
            }

            return result;
        }

        private ValidationResult ValidateDriversLicense(Dictionary<string, string> data)
        {
            var result = new ValidationResult { Score = 0, Flags = new List<IdValidationFlag>() };
            
            // Check required fields
            if (!data.ContainsKey("idNumber") || string.IsNullOrEmpty(data["idNumber"]))
            {
                result.Score += 30;
                result.Flags.Add(new IdValidationFlag
                {
                    Type = "missing_license_number",
                    Severity = "high",
                    Message = "Driver's license number not found or could not be extracted",
                    Impact = "Cannot verify identity without license number"
                });
            }
            else
            {
                // Validate license number format
                var licenseNum = data["idNumber"];
                if (licenseNum.Length < 6 || licenseNum.Length > 15)
                {
                    result.Score += 15;
                    result.Flags.Add(new IdValidationFlag
                    {
                        Type = "invalid_license_format",
                        Severity = "medium",
                        Message = $"License number format appears invalid: {licenseNum}",
                        Impact = "License number doesn't match expected format"
                    });
                }
            }

            // Check expiration date
            if (data.ContainsKey("expirationDate"))
            {
                if (DateTime.TryParse(data["expirationDate"], out var expDate))
                {
                    if (expDate < DateTime.Now)
                    {
                        result.Score += 25;
                        result.Flags.Add(new IdValidationFlag
                        {
                            Type = "expired_id",
                            Severity = "high",
                            Message = $"ID expired on {expDate:MM/dd/yyyy}",
                            Impact = "Expired ID cannot be used for verification"
                        });
                    }
                }
            }
            else
            {
                result.Score += 10;
                result.Flags.Add(new IdValidationFlag
                {
                    Type = "missing_expiration",
                    Severity = "medium",
                    Message = "Expiration date not found",
                    Impact = "Cannot verify if ID is current"
                });
            }

            return result;
        }

        private ValidationResult ValidatePassport(Dictionary<string, string> data)
        {
            var result = new ValidationResult { Score = 0, Flags = new List<IdValidationFlag>() };
            
            // Passport number validation
            if (!data.ContainsKey("idNumber") || string.IsNullOrEmpty(data["idNumber"]))
            {
                result.Score += 30;
                result.Flags.Add(new IdValidationFlag
                {
                    Type = "missing_passport_number",
                    Severity = "high",
                    Message = "Passport number not found",
                    Impact = "Cannot verify passport without number"
                });
            }
            else
            {
                var passportNum = data["idNumber"];
                // US passports: 9 characters, typically starts with letter
                if (passportNum.Length != 9 || !char.IsLetter(passportNum[0]))
                {
                    result.Score += 15;
                    result.Flags.Add(new IdValidationFlag
                    {
                        Type = "invalid_passport_format",
                        Severity = "medium",
                        Message = $"Passport number format appears invalid: {passportNum}",
                        Impact = "Passport number doesn't match expected format"
                    });
                }
            }

            return result;
        }

        private ValidationResult ValidateMilitaryId(Dictionary<string, string> data)
        {
            var result = new ValidationResult { Score = 0, Flags = new List<IdValidationFlag>() };
            
            // EDIPI should be exactly 10 digits
            if (!data.ContainsKey("idNumber") || string.IsNullOrEmpty(data["idNumber"]))
            {
                result.Score += 30;
                result.Flags.Add(new IdValidationFlag
                {
                    Type = "missing_edipi",
                    Severity = "high",
                    Message = "EDIPI number not found",
                    Impact = "Cannot verify military ID without EDIPI"
                });
            }
            else
            {
                var edipi = data["idNumber"];
                if (!Regex.IsMatch(edipi, @"^\d{10}$"))
                {
                    result.Score += 20;
                    result.Flags.Add(new IdValidationFlag
                    {
                        Type = "invalid_edipi_format",
                        Severity = "high",
                        Message = $"EDIPI format invalid: {edipi} (should be 10 digits)",
                        Impact = "EDIPI doesn't match military ID format"
                    });
                }
            }

            return result;
        }

        private ValidationResult ValidateStateId(Dictionary<string, string> data)
        {
            return ValidateDriversLicense(data);
        }

        private ValidationResult ValidateGenericId(Dictionary<string, string> data)
        {
            var result = new ValidationResult { Score = 0, Flags = new List<IdValidationFlag>() };
            
            if (!data.ContainsKey("idNumber") || string.IsNullOrEmpty(data["idNumber"]))
            {
                result.Score += 25;
                result.Flags.Add(new IdValidationFlag
                {
                    Type = "missing_id_number",
                    Severity = "high",
                    Message = "ID number could not be extracted",
                    Impact = "Cannot verify identity without ID number"
                });
            }

            return result;
        }

        private ValidationResult CheckFraudIndicators(
            string filePath, 
            Dictionary<string, string> extractedData, 
            string idType)
        {
            var result = new ValidationResult { Score = 0, Flags = new List<IdValidationFlag>() };
            
            // Check for suspicious patterns in extracted data
            if (extractedData.ContainsKey("idNumber"))
            {
                var idNum = extractedData["idNumber"];
                
                // All same character (e.g., "11111111")
                if (idNum.Distinct().Count() == 1)
                {
                    result.Score += 25;
                    result.Flags.Add(new IdValidationFlag
                    {
                        Type = "suspicious_id_pattern",
                        Severity = "high",
                        Message = "ID number contains repeated characters",
                        Impact = "Likely fake or placeholder ID"
                    });
                }

                // Sequential pattern
                if (IsSequential(idNum))
                {
                    result.Score += 20;
                    result.Flags.Add(new IdValidationFlag
                    {
                        Type = "sequential_id_pattern",
                        Severity = "high",
                        Message = "ID number appears to be sequential",
                        Impact = "Likely fake or test ID"
                    });
                }
            }

            // Check image quality
            var qualityCheck = CheckImageQuality(filePath);
            result.Score += qualityCheck.Score;
            result.Flags.AddRange(qualityCheck.Flags);

            return result;
        }

        private ValidationResult CheckImageQuality(string filePath)
        {
            var result = new ValidationResult { Score = 0, Flags = new List<IdValidationFlag>() };
            
            try
            {
                using var image = SixLabors.ImageSharp.Image.Load(filePath);
                
                // Very low resolution
                if (image.Width < 300 || image.Height < 200)
                {
                    result.Score += 15;
                    result.Flags.Add(new IdValidationFlag
                    {
                        Type = "low_resolution",
                        Severity = "medium",
                        Message = "Image resolution is very low",
                        Impact = "May be a screenshot or poor quality scan - harder to verify authenticity"
                    });
                }
            }
            catch
            {
                result.Score += 10;
            }

            return result;
        }

        private ValidationResult ValidateIdFormat(string idType, Dictionary<string, string> data)
        {
            return new ValidationResult { Score = 0, Flags = new List<IdValidationFlag>() };
        }

        private bool IsSequential(string value)
        {
            if (value.Length < 4) return false;
            
            var digits = value.Where(char.IsDigit).ToArray();
            if (digits.Length < 4) return false;

            var isAscending = true;
            var isDescending = true;
            
            for (int i = 1; i < digits.Length; i++)
            {
                if (digits[i] != digits[i-1] + 1) isAscending = false;
                if (digits[i] != digits[i-1] - 1) isDescending = false;
            }

            return isAscending || isDescending;
        }

        private string GetRiskLevel(double score)
        {
            if (score >= 50) return "high";
            if (score >= 25) return "medium";
            return "low";
        }
    }

    public class IdAnalysisResult
    {
        public string IdType { get; set; } = "";
        public string FileName { get; set; } = "";
        public Dictionary<string, string> ExtractedFields { get; set; } = new();
        public double RiskScore { get; set; }
        public string RiskLevel { get; set; } = "";
        public List<IdValidationFlag> Flags { get; set; } = new();
        public bool IsValid { get; set; }
    }

    public class IdValidationFlag
    {
        public string Type { get; set; } = "";
        public string Severity { get; set; } = "";
        public string Message { get; set; } = "";
        public string Impact { get; set; } = "";
    }

    public class ValidationResult
    {
        public double Score { get; set; }
        public List<IdValidationFlag> Flags { get; set; } = new();
    }
}

