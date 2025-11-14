var builder = WebApplication.CreateBuilder(args);

// Check if migration is requested
if (args.Length > 0 && args[0] == "migrate")
{
    var connectionString = Environment.GetEnvironmentVariable("JAWSDB_URL") 
        ?? "mysql://rafzxyujgowd9c4f:u40pss81sz1ub6t8@durvbryvdw2sjcm5.cbetxkdyhwsb.us-east-1.rds.amazonaws.com:3306/p14kvqervonda4dv";
    
    Console.WriteLine("Running database migration...");
    await MIS321_GroupProject3_Team2.Database.MigrateSchema.RunMigration(connectionString);
    return;
}

// Add services to the container.

builder.Services.AddControllers();

builder.Services.AddCors(options => 
{ options.AddPolicy("OpenPolicy", builder => 
{ builder.AllowAnyOrigin() .AllowAnyMethod() .AllowAnyHeader(); }); 
});

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.UseCors("OpenPolicy");

app.MapControllers();

app.Run();
