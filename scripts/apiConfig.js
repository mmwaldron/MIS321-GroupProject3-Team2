// API Configuration
const API_CONFIG = {
  // Base URL for API calls - adjust for your environment
  get baseUrl() {
    // If using file:// protocol, default to localhost (development)
    if (window.location.protocol === 'file:') {
      // Default to the configured development port
      const port = localStorage.getItem('apiPort') || '5143';
      const baseUrl = `http://localhost:${port}/api`;
      
      // Log helpful message on first API call
      if (!window._apiConfigLogged) {
        console.log(`%cAPI Configuration`, 'color: #28a745; font-weight: bold;');
        console.log(`Opening file directly (file://). API calls will go to: ${baseUrl}`);
        console.log(`Make sure the backend server is running: cd api && dotnet run`);
        window._apiConfigLogged = true;
      }
      
      return baseUrl;
    }
    return window.location.origin + '/api';
  },
  
  // Helper to get full API URL
  getUrl(endpoint) {
    // Ensure endpoint starts with /
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    return `${this.baseUrl}${cleanEndpoint}`;
  }
};

