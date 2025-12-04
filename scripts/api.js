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
      // Check if we're using file:// protocol
      if (window.location.protocol === 'file:') {
        throw new Error('Cannot make API calls from file:// protocol. Please access this page through the web server (e.g., http://localhost:5000/dashboard.html)');
      }

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
        throw new Error(data.message || `HTTP error! status: ${response.status}`);
      }
      
      return data;
    } catch (error) {
      console.error('API request failed:', error);
      
      // Provide helpful error messages
      if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
        throw new Error('Cannot connect to the API server. Make sure the backend server is running and accessible.');
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

  // Passport operations
  async getPassportByCode(code) {
    return await this.request(`/passport/code/${code}`);
  },

  // Message operations
  async createMessage(messageData) {
    return await this.request('/messages', {
      method: 'POST',
      body: JSON.stringify(messageData)
    });
  },

  async getMessages() {
    return await this.request('/messages');
  },

  async getMessagesByUserId(userId) {
    return await this.request(`/messages/user/${userId}`);
  },

  async getUnreadMessages() {
    return await this.request('/messages/unread');
  },

  async markMessageRead(messageId) {
    return await this.request(`/messages/${messageId}/read`, {
      method: 'PUT'
    });
  },

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

  // Get user's passport code
  async getUserPassportCode(userId) {
    return await this.request(`/passport/user/${userId}`);
  },

  // Verify QR code (from uploaded QR image)
  async verifyQRCode(code) {
    return await this.request('/passport/verify-qr-code', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
  },

  // Admin login
  async adminLogin(email) {
    return await this.request('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  // NVD ingestion
  async triggerNvdIngest() {
    return await this.request('/nvd/ingest', {
      method: 'POST'
    });
  }
};

