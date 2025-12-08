// API Client - Replaces database.js functionality
const API = {
  // Helper method for making API calls
  async request(endpoint, options = {}) {
    const url = API_CONFIG.getUrl(endpoint);
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    try {
      const response = await fetch(url, config);
      
      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(`Expected JSON but got: ${text.substring(0, 100)}`);
      }
      
      if (!response.ok) {
        // If the response has a message, use it; otherwise use status text
        const errorMessage = data?.message || data?.error || `HTTP error! status: ${response.status}`;
        const error = new Error(errorMessage);
        error.response = data; // Attach full response for debugging
        error.status = response.status;
        throw error;
      }
      
      return data;
    } catch (error) {
      // Only log non-404 errors (404s are expected for "not found" cases)
      if (error.status !== 404) {
        console.error('API request failed:', error);
      }
      
      // Provide helpful error messages
      if (error.message.includes('Failed to fetch') || error.message.includes('CORS') || error.name === 'TypeError') {
        const isFileProtocol = window.location.protocol === 'file:';
        const port = localStorage.getItem('apiPort') || '5143';
        const serverUrl = `http://localhost:${port}`;
        
        if (isFileProtocol) {
          const errorMsg = `Cannot connect to the API server at ${serverUrl}.\n\n` +
            `Please start the backend server:\n` +
            `1. Open a terminal\n` +
            `2. Navigate to the 'api' folder\n` +
            `3. Run: dotnet run\n\n` +
            `Then refresh this page.`;
          throw new Error(errorMsg);
        } else {
          throw new Error('Cannot connect to the API server. Make sure the backend server is running.');
        }
      }
      
      throw error;
    }
  },

  // User operations
  async createUser(userData) {
    return await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  async getUser(userId) {
    return await this.request(`/users/${userId}`);
  },

  async getUserByEmail(email) {
    return await this.request(`/users/email/${encodeURIComponent(email)}`);
  },

  async updateUser(userId, updates) {
    return await this.request(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  // Verification operations
  async createVerification(verificationData) {
    return await this.request('/verifications', {
      method: 'POST',
      body: JSON.stringify(verificationData)
    });
  },

  async getVerification(verificationId) {
    return await this.request(`/verifications/${verificationId}`);
  },

  async getVerifications() {
    return await this.request('/verifications');
  },

  async getVerificationsByUserId(userId) {
    return await this.request(`/verifications/user/${userId}`);
  },

  async getVerificationDocuments(verificationId) {
    return await this.request(`/verifications/${verificationId}/documents`);
  },

  async updateVerification(verificationId, updates) {
    return await this.request(`/verifications/${verificationId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  async approveVerification(verificationId, adminNotes) {
    return await this.request(`/verifications/${verificationId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ adminNotes: adminNotes || '' })
    });
  },

  async denyVerification(verificationId, adminNotes) {
    return await this.request(`/verifications/${verificationId}/deny`, {
      method: 'POST',
      body: JSON.stringify({ adminNotes: adminNotes || '' })
    });
  },

  // Note: Old passport code system removed - use QR login instead


  // Alert operations
  async createAlert(alertData) {
    return await this.request('/alerts', {
      method: 'POST',
      body: JSON.stringify(alertData)
    });
  },

  async getAlerts() {
    return await this.request('/alerts');
  },

  async getUnreadAlerts() {
    return await this.request('/alerts/unread');
  },

  async markAlertRead(alertId) {
    return await this.request(`/alerts/${alertId}/read`, {
      method: 'PUT'
    });
  },

  // MFA operations
  async sendMFACode(email) {
    return await this.request('/auth/mfa/send', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  async verifyMFACode(email, code) {
    return await this.request('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code })
    });
  },

  // Top alerts (NVD)
  async getTopAlerts() {
    return await this.request('/alerts/top');
  },

  // Company email verification
  async sendCompanyEmailVerification(email) {
    return await this.request('/verifications/email/send', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  async verifyCompanyEmailCode(email, code) {
    return await this.request('/verifications/email/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code })
    });
  },

  // CAPTCHA verification
  async verifyCaptcha(token) {
    return await this.request('/verifications/captcha/verify', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
  },

  // Register pending user (from verification form)
  async registerPendingUser(userData) {
    return await this.request('/verifications/register-pending', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  // Generate QR code for user (admin only)
  async generateQr(userId) {
    return await this.request('/generate-qr', {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  },

  // Admin login
  async adminLogin(email, password) {
    return await this.request('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },

  // NVD ingestion
  async triggerNvdIngest() {
    return await this.request('/nvd/ingest', {
      method: 'POST'
    });
  }
};

