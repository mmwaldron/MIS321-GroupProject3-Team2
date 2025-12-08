using System.Text.Json;
using Microsoft.AspNetCore.Http;

namespace MIS321_GroupProject3_Team2.Services
{
    public class DocumentAnalysisService
    {
        public async Task<DocumentAnalysisResult> AnalyzeDocument(string filePath, IFormFile file)
        {
            var result = new DocumentAnalysisResult
            {
                FileName = file.FileName,
                FileSize = file.Length,
                FileType = Path.GetExtension(file.FileName).ToLower(),
                MimeType = file.ContentType,
                Flags = new List<DocumentFlag>(),
                RiskScore = 0
            };

            // 1. File Type Validation
            var typeRisk = ValidateFileType(file);
            result.Flags.AddRange(typeRisk.Flags);
            result.RiskScore += typeRisk.Score;

            // 2. File Size Analysis
            var sizeRisk = AnalyzeFileSize(file.Length);
            result.Flags.AddRange(sizeRisk.Flags);
            result.RiskScore += sizeRisk.Score;

            // 3. MIME Type Verification
            var mimeRisk = VerifyMimeType(file, filePath);
            result.Flags.AddRange(mimeRisk.Flags);
            result.RiskScore += mimeRisk.Score;

            // 4. File Metadata Analysis
            var metadataRisk = AnalyzeMetadata(filePath);
            result.Flags.AddRange(metadataRisk.Flags);
            result.RiskScore += metadataRisk.Score;

            // 5. Content Analysis (for images)
            if (IsImageFile(filePath))
            {
                var imageRisk = AnalyzeImageContent(filePath);
                result.Flags.AddRange(imageRisk.Flags);
                result.RiskScore += imageRisk.Score;
            }

            // 6. PDF Analysis (if PDF)
            if (filePath.EndsWith(".pdf"))
            {
                var pdfRisk = await AnalyzePdfContent(filePath);
                result.Flags.AddRange(pdfRisk.Flags);
                result.RiskScore += pdfRisk.Score;
            }

            result.RiskScore = Math.Min(100, Math.Max(0, result.RiskScore));
            result.RiskLevel = GetRiskLevel(result.RiskScore);

            return result;
        }

        private RiskComponent ValidateFileType(IFormFile file)
        {
            var component = new RiskComponent { Score = 0, Flags = new List<DocumentFlag>() };
            var extension = Path.GetExtension(file.FileName).ToLower();
            
            var allowedTypes = new[] { ".pdf", ".jpg", ".jpeg", ".png" };
            if (!allowedTypes.Contains(extension))
            {
                component.Score += 30;
                component.Flags.Add(new DocumentFlag
                {
                    Type = "invalid_file_type",
                    Severity = "high",
                    Message = $"Invalid file type: {extension}",
                    Impact = "File type not allowed for verification documents"
                });
            }

            return component;
        }

        private RiskComponent AnalyzeFileSize(long fileSize)
        {
            var component = new RiskComponent { Score = 0, Flags = new List<DocumentFlag>() };
            
            // Very small files might be corrupted or fake
            if (fileSize < 1024) // Less than 1KB
            {
                component.Score += 25;
                component.Flags.Add(new DocumentFlag
                {
                    Type = "suspicious_size",
                    Severity = "high",
                    Message = "File size is unusually small",
                    Impact = "File may be corrupted, empty, or fake"
                });
            }
            // Very large files might be malicious
            else if (fileSize > 5 * 1024 * 1024) // More than 5MB
            {
                component.Score += 10;
                component.Flags.Add(new DocumentFlag
                {
                    Type = "large_file",
                    Severity = "medium",
                    Message = $"File size is large: {(fileSize / 1024.0 / 1024.0):F2}MB",
                    Impact = "Large files may indicate embedded content or manipulation"
                });
            }

            return component;
        }

        private RiskComponent VerifyMimeType(IFormFile file, string filePath)
        {
            var component = new RiskComponent { Score = 0, Flags = new List<DocumentFlag>() };
            var extension = Path.GetExtension(filePath).ToLower();
            var mimeType = file.ContentType;

            // Check if MIME type matches file extension
            var expectedMimeTypes = new Dictionary<string, string[]>
            {
                { ".pdf", new[] { "application/pdf" } },
                { ".jpg", new[] { "image/jpeg" } },
                { ".jpeg", new[] { "image/jpeg" } },
                { ".png", new[] { "image/png" } }
            };

            if (expectedMimeTypes.ContainsKey(extension))
            {
                if (!expectedMimeTypes[extension].Contains(mimeType))
                {
                    component.Score += 20;
                    component.Flags.Add(new DocumentFlag
                    {
                        Type = "mime_mismatch",
                        Severity = "high",
                        Message = $"MIME type mismatch: expected {string.Join(", ", expectedMimeTypes[extension])}, got {mimeType}",
                        Impact = "File extension doesn't match actual file type - possible manipulation"
                    });
                }
            }

            return component;
        }

        private RiskComponent AnalyzeMetadata(string filePath)
        {
            var component = new RiskComponent { Score = 0, Flags = new List<DocumentFlag>() };
            
            try
            {
                var fileInfo = new FileInfo(filePath);
                
                // Check if file was created very recently (might be generated)
                var timeSinceCreation = DateTime.UtcNow - fileInfo.CreationTimeUtc;
                if (timeSinceCreation.TotalMinutes < 5)
                {
                    component.Score += 5;
                    component.Flags.Add(new DocumentFlag
                    {
                        Type = "recent_creation",
                        Severity = "low",
                        Message = "File was created very recently",
                        Impact = "May indicate document was generated just for verification"
                    });
                }

                // Check for suspicious filename patterns
                var fileName = fileInfo.Name.ToLower();
                if (fileName.Contains("test") || fileName.Contains("fake") || fileName.Contains("sample"))
                {
                    component.Score += 15;
                    component.Flags.Add(new DocumentFlag
                    {
                        Type = "suspicious_filename",
                        Severity = "medium",
                        Message = "Filename contains suspicious keywords",
                        Impact = "Filename suggests test or fake document"
                    });
                }
            }
            catch
            {
                // Metadata analysis failed - minor risk
                component.Score += 5;
            }

            return component;
        }

        private RiskComponent AnalyzeImageContent(string filePath)
        {
            var component = new RiskComponent { Score = 0, Flags = new List<DocumentFlag>() };
            
            try
            {
                // Using SixLabors.ImageSharp for basic image analysis
                using var image = SixLabors.ImageSharp.Image.Load(filePath);
                
                // Check image dimensions
                if (image.Width < 100 || image.Height < 100)
                {
                    component.Score += 15;
                    component.Flags.Add(new DocumentFlag
                    {
                        Type = "low_resolution",
                        Severity = "medium",
                        Message = $"Image resolution is very low: {image.Width}x{image.Height}",
                        Impact = "Low resolution images may be screenshots or poor quality scans"
                    });
                }

                // Check if image is too large (might be edited)
                if (image.Width > 5000 || image.Height > 5000)
                {
                    component.Score += 5;
                    component.Flags.Add(new DocumentFlag
                    {
                        Type = "high_resolution",
                        Severity = "low",
                        Message = $"Image resolution is very high: {image.Width}x{image.Height}",
                        Impact = "Unusually high resolution may indicate manipulation"
                    });
                }
            }
            catch (Exception ex)
            {
                component.Score += 10;
                component.Flags.Add(new DocumentFlag
                {
                    Type = "image_analysis_failed",
                    Severity = "medium",
                    Message = "Failed to analyze image content",
                    Impact = "Cannot verify image integrity"
                });
            }

            return component;
        }

        private async Task<RiskComponent> AnalyzePdfContent(string filePath)
        {
            var component = new RiskComponent { Score = 0, Flags = new List<DocumentFlag>() };
            
            try
            {
                // Basic PDF analysis - check file structure
                var fileBytes = await File.ReadAllBytesAsync(filePath);
                
                // Check PDF header (%PDF)
                if (fileBytes.Length < 5 || 
                     !(fileBytes[0] == 0x25 && fileBytes[1] == 0x50 && fileBytes[2] == 0x44 && fileBytes[3] == 0x46))
                {
                    component.Score += 25;
                    component.Flags.Add(new DocumentFlag
                    {
                        Type = "invalid_pdf",
                        Severity = "high",
                        Message = "File does not appear to be a valid PDF",
                        Impact = "PDF structure is corrupted or file is not actually a PDF"
                    });
                }
                else
                {
                    // Valid PDF - positive indicator
                    component.Flags.Add(new DocumentFlag
                    {
                        Type = "valid_pdf",
                        Severity = "info",
                        Message = "PDF structure appears valid",
                        Impact = "Positive: Document format is correct"
                    });
                }
            }
            catch
            {
                component.Score += 10;
                component.Flags.Add(new DocumentFlag
                {
                    Type = "pdf_analysis_failed",
                    Severity = "medium",
                    Message = "Failed to analyze PDF content",
                    Impact = "Cannot verify PDF integrity"
                });
            }

            return component;
        }

        private bool IsImageFile(string filePath)
        {
            var ext = Path.GetExtension(filePath).ToLower();
            return ext == ".jpg" || ext == ".jpeg" || ext == ".png";
        }

        private string GetRiskLevel(double score)
        {
            if (score >= 50) return "high";
            if (score >= 25) return "medium";
            return "low";
        }
    }

    public class DocumentAnalysisResult
    {
        public string FileName { get; set; } = "";
        public long FileSize { get; set; }
        public string FileType { get; set; } = "";
        public string MimeType { get; set; } = "";
        public double RiskScore { get; set; }
        public string RiskLevel { get; set; } = "";
        public List<DocumentFlag> Flags { get; set; } = new();
    }

    public class DocumentFlag
    {
        public string Type { get; set; } = "";
        public string Severity { get; set; } = "";
        public string Message { get; set; } = "";
        public string Impact { get; set; } = "";
    }

    public class RiskComponent
    {
        public double Score { get; set; }
        public List<DocumentFlag> Flags { get; set; } = new();
    }
}

