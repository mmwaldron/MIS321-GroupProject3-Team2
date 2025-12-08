// Database layer using localStorage
const Database = {
  // Initialize database
  init() {
    if (!localStorage.getItem('bioIsac_users')) {
      localStorage.setItem('bioIsac_users', JSON.stringify([]));
    }
    if (!localStorage.getItem('bioIsac_verifications')) {
      localStorage.setItem('bioIsac_verifications', JSON.stringify([]));
    }
    if (!localStorage.getItem('bioIsac_messages')) {
      localStorage.setItem('bioIsac_messages', JSON.stringify([]));
    }
    if (!localStorage.getItem('bioIsac_alerts')) {
      localStorage.setItem('bioIsac_alerts', JSON.stringify([]));
    }
  },

  // User operations
  createUser(userData) {
    const users = this.getUsers();
    const newUser = {
      id: this.generateId(),
      ...userData,
      createdAt: new Date().toISOString(),
      verified: false,
      trustScore: 0,
      passportId: null,
      verifiedAt: null
    };
    users.push(newUser);
    localStorage.setItem('bioIsac_users', JSON.stringify(users));
    return newUser;
  },

  getUser(userId) {
    const users = this.getUsers();
    return users.find(u => u.id === userId);
  },

  getUserByEmail(email) {
    const users = this.getUsers();
    return users.find(u => u.email === email);
  },

  getUsers() {
    return JSON.parse(localStorage.getItem('bioIsac_users') || '[]');
  },

  updateUser(userId, updates) {
    const users = this.getUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index !== -1) {
      users[index] = { ...users[index], ...updates };
      localStorage.setItem('bioIsac_users', JSON.stringify(users));
      return users[index];
    }
    return null;
  },

  // Verification operations
  createVerification(verificationData) {
    const verifications = this.getVerifications();
    const newVerification = {
      id: this.generateId(),
      ...verificationData,
      createdAt: new Date().toISOString(),
      status: 'pending',
      adminNotes: null,
      reviewedAt: null,
      reviewedBy: null
    };
    verifications.push(newVerification);
    localStorage.setItem('bioIsac_verifications', JSON.stringify(verifications));
    return newVerification;
  },

  getVerification(verificationId) {
    const verifications = this.getVerifications();
    return verifications.find(v => v.id === verificationId);
  },

  getVerifications() {
    return JSON.parse(localStorage.getItem('bioIsac_verifications') || '[]');
  },

  getVerificationsByUserId(userId) {
    const verifications = this.getVerifications();
    return verifications.filter(v => v.userId === userId);
  },

  updateVerification(verificationId, updates) {
    const verifications = this.getVerifications();
    const index = verifications.findIndex(v => v.id === verificationId);
    if (index !== -1) {
      verifications[index] = { ...verifications[index], ...updates };
      localStorage.setItem('bioIsac_verifications', JSON.stringify(verifications));
      return verifications[index];
    }
    return null;
  },

  // Message operations
  createMessage(messageData) {
    const messages = this.getMessages();
    const newMessage = {
      id: this.generateId(),
      ...messageData,
      createdAt: new Date().toISOString(),
      read: false,
      replied: false
    };
    messages.push(newMessage);
    localStorage.setItem('bioIsac_messages', JSON.stringify(messages));
    return newMessage;
  },

  getMessages() {
    return JSON.parse(localStorage.getItem('bioIsac_messages') || '[]');
  },

  getMessagesByUserId(userId) {
    const messages = this.getMessages();
    return messages.filter(m => m.userId === userId || m.toUserId === userId);
  },

  getUnreadMessages() {
    const messages = this.getMessages();
    // Get messages sent TO admin (toUserId is null) that are unread
    return messages.filter(m => !m.read && (m.toUserId === null || m.toUserId === undefined));
  },

  markMessageRead(messageId) {
    const messages = this.getMessages();
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      messages[index].read = true;
      localStorage.setItem('bioIsac_messages', JSON.stringify(messages));
    }
  },

  // Alert operations
  createAlert(alertData) {
    const alerts = this.getAlerts();
    const newAlert = {
      id: this.generateId(),
      ...alertData,
      createdAt: new Date().toISOString(),
      read: false
    };
    alerts.push(newAlert);
    localStorage.setItem('bioIsac_alerts', JSON.stringify(alerts));
    return newAlert;
  },

  getAlerts() {
    return JSON.parse(localStorage.getItem('bioIsac_alerts') || '[]');
  },

  getUnreadAlerts() {
    const alerts = this.getAlerts();
    return alerts.filter(a => !a.read);
  },

  markAlertRead(alertId) {
    const alerts = this.getAlerts();
    const index = alerts.findIndex(a => a.id === alertId);
    if (index !== -1) {
      alerts[index].read = true;
      localStorage.setItem('bioIsac_alerts', JSON.stringify(alerts));
    }
  },

  // Utility
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
};

// Initialize on load
Database.init();

