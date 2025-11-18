using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace MIS321_GroupProject3_Team2.Database
{
    public class Database
    {
        public string ConnectionString { get; set; }

        public Database(string connectionString)
        {
            ConnectionString = connectionString;
        }
        
        // Helper method to parse JAWSDB_URL format if needed
        public static string ParseJawsDbUrl(string jawsDbUrl)
        {
            // JAWSDB_URL format: mysql://user:pass@host:port/db
            if (string.IsNullOrEmpty(jawsDbUrl))
                return null;
                
            // Remove mysql:// prefix
            var uri = new Uri(jawsDbUrl.Replace("mysql://", "http://"));
            var connectionString = $"Server={uri.Host};Database={uri.AbsolutePath.TrimStart('/')};User={uri.UserInfo.Split(':')[0]};Password={uri.UserInfo.Split(':')[1]};Port={uri.Port};";
            return connectionString;
        }
    }
}