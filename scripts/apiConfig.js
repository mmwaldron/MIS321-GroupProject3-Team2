// API Configuration
const API_CONFIG = {
  // Base URL for API calls - adjust for your environment
  get baseUrl() {
    // If using file:// protocol, default to localhost (development)
    if (window.location.protocol === 'file:') {
      // Default to the configured development port
      const port = localStorage.getItem('apiPort') || '5143';
      return `http://localhost:${port}/api`;
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

