using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

// Check if migration is requested
if (args.Length > 0 && args[0] == "migrate")
{
    var migrateConnectionString = Environment.GetEnvironmentVariable("JAWSDB_URL") 
        ?? "mysql://rafzxyujgowd9c4f:u40pss81sz1ub6t8@durvbryvdw2sjcm5.cbetxkdyhwsb.us-east-1.rds.amazonaws.com:3306/p14kvqervonda4dv";
    
    Console.WriteLine("Running database migration...");
    await MIS321_GroupProject3_Team2.Database.MigrateSchema.RunMigration(migrateConnectionString);
    return;
}

// Add services to the container.

// Get connection string
var configConn = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrEmpty(configConn) || configConn == "${JAWSDB_URL}")
{
    configConn = null;
}
var connectionString = configConn 
    ?? Environment.GetEnvironmentVariable("JAWSDB_URL") 
    ?? "mysql://rafzxyujgowd9c4f:u40pss81sz1ub6t8@durvbryvdw2sjcm5.cbetxkdyhwsb.us-east-1.rds.amazonaws.com:3306/p14kvqervonda4dv";

// Register NVD Ingest Service
builder.Services.AddSingleton<MIS321_GroupProject3_Team2.Services.NvdIngestService>(
    sp => new MIS321_GroupProject3_Team2.Services.NvdIngestService(connectionString));

builder.Services.AddControllers();

builder.Services.AddCors(options => 
{ options.AddPolicy("OpenPolicy", builder => 
{ builder.AllowAnyOrigin() .AllowAnyMethod() .AllowAnyHeader(); }); 
});

var app = builder.Build();

// Configure the HTTP request pipeline.

app.UseHttpsRedirection();

// Serve static files from parent directory (where HTML, CSS, JS files are)
var staticFileProvider = new PhysicalFileProvider(
    Path.Combine(Directory.GetCurrentDirectory(), ".."));

// Add default files (index.html, etc.) - must come before UseStaticFiles
var defaultFileOptions = new DefaultFilesOptions
{
    FileProvider = staticFileProvider,
    RequestPath = ""
};
defaultFileOptions.DefaultFileNames.Clear();
defaultFileOptions.DefaultFileNames.Add("index.html");
app.UseDefaultFiles(defaultFileOptions);

// Serve static files
var staticFileOptions = new StaticFileOptions
{
    FileProvider = staticFileProvider,
    RequestPath = ""
};
app.UseStaticFiles(staticFileOptions);

app.UseAuthorization();

app.UseCors("OpenPolicy");

// Map API controllers BEFORE fallback routes
app.MapControllers();

// Fallback route to serve index.html for SPA routing (only for non-API routes)
app.MapFallback(async context =>
{
    // Don't serve HTML for API routes - return 404 JSON
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.StatusCode = 404;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync("{\"message\":\"Not found\"}");
        return;
    }
    
    // For non-API routes, serve index.html
    var filePath = Path.Combine(Directory.GetCurrentDirectory(), "..", "index.html");
    if (File.Exists(filePath))
    {
        context.Response.ContentType = "text/html";
        await context.Response.SendFileAsync(filePath);
    }
    else
    {
        context.Response.StatusCode = 404;
        await context.Response.WriteAsync("index.html not found");
    }
});

app.Run();
