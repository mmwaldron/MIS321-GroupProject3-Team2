using MySqlConnector;
using System.Text;

namespace MIS321_GroupProject3_Team2.Database
{
    public class MigrateSchema
    {
        public static async Task RunMigration(string connectionString)
        {
            // Parse JAWSDB_URL format if needed
            if (connectionString.StartsWith("mysql://"))
            {
                connectionString = ParseJawsDbUrl(connectionString);
            }

            // Read schema.sql
            var schemaPath = Path.Combine("Database", "schema.sql");
            if (!File.Exists(schemaPath))
            {
                schemaPath = Path.Combine("..", "Database", "schema.sql");
                if (!File.Exists(schemaPath))
                {
                    schemaPath = "schema.sql";
                }
            }
            
            if (!File.Exists(schemaPath))
            {
                throw new FileNotFoundException($"Schema file not found. Tried: {schemaPath}");
            }

            var schemaSql = await File.ReadAllTextAsync(schemaPath);

            using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();
            Console.WriteLine("Connected to database successfully.");

            // Split SQL by semicolons, but be careful with comments and multi-line statements
            var statements = SplitSqlStatements(schemaSql);

            foreach (var statement in statements)
            {
                var trimmed = statement.Trim();
                if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("--"))
                {
                    continue;
                }

                try
                {
                    using var command = new MySqlCommand(trimmed, connection);
                    await command.ExecuteNonQueryAsync();
                    Console.WriteLine($"✓ Executed: {GetStatementPreview(trimmed)}");
                }
                catch (MySqlException ex) when (ex.Number == 1050) // Table already exists
                {
                    Console.WriteLine($"⚠ Table already exists, skipping: {GetStatementPreview(trimmed)}");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"✗ Error executing statement: {GetStatementPreview(trimmed)}");
                    Console.WriteLine($"  Error: {ex.Message}");
                    throw;
                }
            }

            Console.WriteLine("\n✓ Schema migration completed successfully!");
        }

        private static string ParseJawsDbUrl(string jawsDbUrl)
        {
            // JAWSDB_URL format: mysql://user:pass@host:port/db
            var uri = new Uri(jawsDbUrl.Replace("mysql://", "http://"));
            var userInfo = uri.UserInfo.Split(':');
            var database = uri.AbsolutePath.TrimStart('/');
            
            return $"Server={uri.Host};Database={database};User={userInfo[0]};Password={userInfo[1]};Port={uri.Port};";
        }

        private static List<string> SplitSqlStatements(string sql)
        {
            var statements = new List<string>();
            var currentStatement = new StringBuilder();
            var inString = false;
            var stringChar = '\0';

            foreach (var line in sql.Split('\n'))
            {
                var trimmedLine = line.Trim();
                
                // Skip comment-only lines
                if (trimmedLine.StartsWith("--") || string.IsNullOrWhiteSpace(trimmedLine))
                {
                    continue;
                }

                // Check for string literals
                for (int i = 0; i < line.Length; i++)
                {
                    var ch = line[i];
                    
                    if (!inString && (ch == '\'' || ch == '"'))
                    {
                        inString = true;
                        stringChar = ch;
                    }
                    else if (inString && ch == stringChar && (i == 0 || line[i - 1] != '\\'))
                    {
                        inString = false;
                    }
                    
                    currentStatement.Append(ch);
                }

                currentStatement.Append('\n');

                // If line ends with semicolon and we're not in a string, it's the end of a statement
                if (trimmedLine.EndsWith(";") && !inString)
                {
                    var statement = currentStatement.ToString().Trim();
                    if (!string.IsNullOrWhiteSpace(statement))
                    {
                        statements.Add(statement);
                    }
                    currentStatement.Clear();
                }
            }

            // Add any remaining statement
            var remaining = currentStatement.ToString().Trim();
            if (!string.IsNullOrWhiteSpace(remaining))
            {
                statements.Add(remaining);
            }

            return statements;
        }

        private static string GetStatementPreview(string statement)
        {
            var firstLine = statement.Split('\n').FirstOrDefault()?.Trim() ?? "";
            if (firstLine.Length > 60)
            {
                return firstLine.Substring(0, 57) + "...";
            }
            return firstLine;
        }
    }
}

