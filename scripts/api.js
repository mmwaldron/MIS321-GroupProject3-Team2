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
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || `HTTP error! status: ${response.status}`);
      }
      
      return data;
    } catch (error) {
      console.error('API request failed:', error);
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
  }
};

