// API Configuration
const API_CONFIG = {
  // Base URL for API calls - adjust for your environment
  baseUrl: window.location.origin + '/api',
  
  // Helper to get full API URL
  getUrl(endpoint) {
    return `${this.baseUrl}${endpoint}`;
  }
};

