// Trust Score System
const TrustScore = {
  // Calculate initial trust score
  calculateInitialScore(verificationData, riskAssessment) {
    let score = 50; // Base score

    // Positive factors
    if (verificationData.hasDocument) score += 15;
    if (verificationData.license) score += 10;
    if (this.isValidEmailDomain(verificationData.email)) score += 5;
    if (this.isValidOrganization(verificationData.organization)) score += 5;

    // Risk-based adjustments
    if (riskAssessment.level === 'low') score += 15;
    else if (riskAssessment.level === 'medium') score += 5;
    else if (riskAssessment.level === 'high') score -= 10;

    // MFA completion
    if (verificationData.mfaVerified) score += 10;

    return Math.max(0, Math.min(100, score));
  },

  // Update trust score based on behavior
  updateScore(userId, action, value) {
    const user = Database.getUser(userId);
    if (!user) return null;

    let newScore = user.trustScore || 50;

    switch (action) {
      case 'admin_approval':
        newScore += value || 10;
        break;
      case 'admin_denial':
        newScore -= value || 20;
        break;
      case 'positive_interaction':
        newScore += value || 5;
        break;
      case 'negative_interaction':
        newScore -= value || 10;
        break;
      case 'time_based':
        // Gradual increase over time for verified users
        const daysSinceVerification = (Date.now() - new Date(user.verifiedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceVerification > 30) newScore += 2;
        if (daysSinceVerification > 90) newScore += 3;
        break;
    }

    newScore = Math.max(0, Math.min(100, newScore));
    Database.updateUser(userId, { trustScore: newScore });
    return newScore;
  },

  // Get access tier based on trust score
  getTier(score) {
    if (score >= 90) return 'Tier 5 - Elite';
    if (score >= 75) return 'Tier 4 - Advanced';
    if (score >= 60) return 'Tier 3 - Standard';
    if (score >= 40) return 'Tier 2 - Basic';
    return 'Tier 1 - Restricted';
  },

  // Get access permissions based on tier
  getAccessPermissions(score) {
    const tier = this.getTier(score);
    const permissions = {
      'Tier 5 - Elite': {
        messaging: true,
        dataAccess: 'full',
        prioritySupport: true,
        apiAccess: true
      },
      'Tier 4 - Advanced': {
        messaging: true,
        dataAccess: 'extended',
        prioritySupport: true,
        apiAccess: false
      },
      'Tier 3 - Standard': {
        messaging: true,
        dataAccess: 'standard',
        prioritySupport: false,
        apiAccess: false
      },
      'Tier 2 - Basic': {
        messaging: true,
        dataAccess: 'limited',
        prioritySupport: false,
        apiAccess: false
      },
      'Tier 1 - Restricted': {
        messaging: false,
        dataAccess: 'minimal',
        prioritySupport: false,
        apiAccess: false
      }
    };
    return permissions[tier] || permissions['Tier 1 - Restricted'];
  },

  // Validate email domain
  isValidEmailDomain(email) {
    const domain = email.split('@')[1];
    if (!domain) return false;
    const trustedDomains = ['.edu', '.gov', '.org'];
    return trustedDomains.some(d => domain.includes(d)) || domain.includes('.');
  },

  // Validate organization
  isValidOrganization(org) {
    return org && org.length >= 3;
  }
};

