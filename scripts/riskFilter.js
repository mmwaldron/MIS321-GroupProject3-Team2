<<<<<<< HEAD
// Risk Filtering Algorithm
const RiskFilter = {
  // Calculate risk score based on multiple factors
  calculateRiskScore(verificationData) {
    let riskScore = 0;
    const factors = {
      emailDomain: this.checkEmailDomain(verificationData.email),
      phoneFormat: this.checkPhoneFormat(verificationData.phone),
      govIdFormat: this.checkGovIdFormat(verificationData.govId),
      organization: this.checkOrganization(verificationData.organization),
      documentUpload: verificationData.hasDocument ? 0 : 10,
      companyEmailVerified: verificationData.emailVerified ? -5 : 0
    };

    riskScore += factors.emailDomain;
    riskScore += factors.phoneFormat;
    riskScore += factors.govIdFormat;
    riskScore += factors.organization;
    riskScore += factors.documentUpload;
    riskScore += factors.companyEmailVerified;

    // Normalize to 0-100 scale
    riskScore = Math.max(0, Math.min(100, riskScore));

    return {
      score: riskScore,
      level: this.getRiskLevel(riskScore),
      factors: factors
    };
  },

  // Calculate urgency score (0-100)
  calculateUrgency(verificationData, riskScore) {
    let urgency = 0;

    // High risk = high urgency
    if (riskScore >= 70) urgency += 40;
    else if (riskScore >= 40) urgency += 20;

    // Recent creation = higher urgency
    const hoursSinceCreation = (Date.now() - new Date(verificationData.createdAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreation < 1) urgency += 30;
    else if (hoursSinceCreation < 24) urgency += 15;

    // Suspicious patterns
    if (this.hasSuspiciousPatterns(verificationData)) urgency += 30;

    return Math.min(100, urgency);
  },

  // Calculate credibility score (0-100)
  calculateCredibility(verificationData) {
    let credibility = 50; // Base credibility

    // Positive factors
    if (verificationData.hasDocument) credibility += 20;
    if (verificationData.emailVerified) credibility += 15;
    if (this.isValidEmailDomain(verificationData.email)) credibility += 10;
    if (this.isValidOrganization(verificationData.organization)) credibility += 10;

    // Negative factors
    if (!verificationData.govId || verificationData.govId.length < 4) credibility -= 15;
    if (!this.isValidPhone(verificationData.phone)) credibility -= 10;

    return Math.max(0, Math.min(100, credibility));
  },

  // Get risk level from score
  getRiskLevel(score) {
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  },

  // Check email domain
  checkEmailDomain(email) {
    const suspiciousDomains = ['tempmail', 'throwaway', '10minutemail', 'guerrillamail'];
    const domain = email.split('@')[1]?.toLowerCase() || '';
    
    if (suspiciousDomains.some(d => domain.includes(d))) return 20;
    if (domain.includes('.edu') || domain.includes('.gov')) return -5;
    return 0;
  },

  // Check phone format
  checkPhoneFormat(phone) {
    // Phone is optional, so if not provided, don't add risk
    if (!phone || phone === null || phone === '' || phone === undefined) return 0;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) return 15;
    if (cleaned.length > 15) return 10;
    return 0;
  },

  // Check government ID format
  checkGovIdFormat(govId) {
    if (!govId || govId.length < 4) return 25;
    if (/^\d{4}$/.test(govId)) return 0;
    return 10;
  },

  // Check organization
  checkOrganization(org) {
    // Organization is optional, so if not provided, don't add risk
    if (!org || org === null || org === '' || org === undefined) return 0;
    if (org.length < 2) return 15;
    const suspicious = ['test', 'fake', 'demo', 'example'];
    if (suspicious.some(s => org.toLowerCase().includes(s))) return 20;
    return 0;
  },

  // Check for suspicious patterns
  hasSuspiciousPatterns(verificationData) {
    // Check for repeated characters or patterns
    const name = verificationData.name || '';
    const email = verificationData.email || '';
    
    // Repeated characters
    if (/(.)\1{4,}/.test(name)) return true;
    if (/(.)\1{4,}/.test(email)) return true;

    // Sequential patterns
    if (/12345|abcde|qwerty/i.test(name)) return true;

    return false;
  },

  // Validate email domain
  isValidEmailDomain(email) {
    const domain = email.split('@')[1];
    if (!domain) return false;
    return domain.includes('.') && domain.length > 3;
  },

  // Validate organization
  isValidOrganization(org) {
    return org && org.length >= 3 && /^[a-zA-Z0-9\s&.,-]+$/.test(org);
  },

  // Validate phone
  isValidPhone(phone) {
    if (!phone || phone === null || phone === '' || phone === undefined) return false;
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  },

  // Rank verifications by urgency and credibility
  rankVerifications(verifications) {
    return verifications.map(v => {
      const risk = this.calculateRiskScore(v);
      const urgency = this.calculateUrgency(v, risk.score);
      const credibility = this.calculateCredibility(v);

      return {
        ...v,
        riskScore: risk.score,
        riskLevel: risk.level,
        urgency,
        credibility,
        priority: (urgency * 0.6) + ((100 - credibility) * 0.4) // Higher priority = more urgent and less credible
      };
    }).sort((a, b) => b.priority - a.priority);
  }
};

=======
// Risk Filtering Algorithm
const RiskFilter = {
  // Calculate risk score based on multiple factors
  calculateRiskScore(verificationData) {
    let riskScore = 0;
    const factors = {
      emailDomain: this.checkEmailDomain(verificationData.email),
      phoneFormat: this.checkPhoneFormat(verificationData.phone),
      govIdFormat: this.checkGovIdFormat(verificationData.govId),
      organization: this.checkOrganization(verificationData.organization),
      documentUpload: verificationData.hasDocument ? 0 : 10,
      companyEmailVerified: verificationData.emailVerified ? -5 : 0
    };

    riskScore += factors.emailDomain;
    riskScore += factors.phoneFormat;
    riskScore += factors.govIdFormat;
    riskScore += factors.organization;
    riskScore += factors.documentUpload;
    riskScore += factors.companyEmailVerified;

    // Normalize to 0-100 scale
    riskScore = Math.max(0, Math.min(100, riskScore));

    return {
      score: riskScore,
      level: this.getRiskLevel(riskScore),
      factors: factors
    };
  },

  // Calculate urgency score (0-100)
  calculateUrgency(verificationData, riskScore) {
    let urgency = 0;

    // High risk = high urgency
    if (riskScore >= 70) urgency += 40;
    else if (riskScore >= 40) urgency += 20;

    // Recent creation = higher urgency
    const hoursSinceCreation = (Date.now() - new Date(verificationData.createdAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreation < 1) urgency += 30;
    else if (hoursSinceCreation < 24) urgency += 15;

    // Suspicious patterns
    if (this.hasSuspiciousPatterns(verificationData)) urgency += 30;

    return Math.min(100, urgency);
  },

  // Calculate credibility score (0-100)
  calculateCredibility(verificationData) {
    let credibility = 50; // Base credibility

    // Positive factors
    if (verificationData.hasDocument) credibility += 20;
    if (verificationData.emailVerified) credibility += 15;
    if (this.isValidEmailDomain(verificationData.email)) credibility += 10;
    if (verificationData.organization && this.isValidOrganization(verificationData.organization)) credibility += 10;

    // Negative factors
    if (!verificationData.govId || verificationData.govId.length < 4) credibility -= 15;
    // Phone is optional, only penalize if provided and invalid
    if (verificationData.phone && !this.isValidPhone(verificationData.phone)) credibility -= 10;

    return Math.max(0, Math.min(100, credibility));
  },

  // Get risk level from score
  getRiskLevel(score) {
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  },

  // Check email domain
  checkEmailDomain(email) {
    const suspiciousDomains = ['tempmail', 'throwaway', '10minutemail', 'guerrillamail'];
    const domain = email.split('@')[1]?.toLowerCase() || '';
    
    if (suspiciousDomains.some(d => domain.includes(d))) return 20;
    if (domain.includes('.edu') || domain.includes('.gov')) return -5;
    return 0;
  },

  // Check phone format
  checkPhoneFormat(phone) {
    // Phone is optional, so if not provided, don't add risk
    if (!phone || phone === null || phone === '') return 0;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) return 15;
    if (cleaned.length > 15) return 10;
    return 0;
  },

  // Check government ID format
  checkGovIdFormat(govId) {
    if (!govId || govId.length < 4) return 25;
    if (/^\d{4}$/.test(govId)) return 0;
    return 10;
  },

  // Check organization
  checkOrganization(org) {
    // Organization is optional, so if not provided, don't add risk
    if (!org || org === null || org === '') return 0;
    if (org.length < 2) return 15;
    const suspicious = ['test', 'fake', 'demo', 'example'];
    if (suspicious.some(s => org.toLowerCase().includes(s))) return 20;
    return 0;
  },

  // Check for suspicious patterns
  hasSuspiciousPatterns(verificationData) {
    // Check for repeated characters or patterns
    const name = verificationData.name || '';
    const email = verificationData.email || '';
    
    // Repeated characters
    if (/(.)\1{4,}/.test(name)) return true;
    if (/(.)\1{4,}/.test(email)) return true;

    // Sequential patterns
    if (/12345|abcde|qwerty/i.test(name)) return true;

    return false;
  },

  // Validate email domain
  isValidEmailDomain(email) {
    const domain = email.split('@')[1];
    if (!domain) return false;
    return domain.includes('.') && domain.length > 3;
  },

  // Validate organization
  isValidOrganization(org) {
    return org && org.length >= 3 && /^[a-zA-Z0-9\s&.,-]+$/.test(org);
  },

  // Validate phone
  isValidPhone(phone) {
    if (!phone || phone === null || phone === '') return false;
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  },

  // Rank verifications by urgency and credibility
  rankVerifications(verifications) {
    return verifications.map(v => {
      const risk = this.calculateRiskScore(v);
      const urgency = this.calculateUrgency(v, risk.score);
      const credibility = this.calculateCredibility(v);

      return {
        ...v,
        riskScore: risk.score,
        riskLevel: risk.level,
        urgency,
        credibility,
        priority: (urgency * 0.6) + ((100 - credibility) * 0.4) // Higher priority = more urgent and less credible
      };
    }).sort((a, b) => b.priority - a.priority);
  }
};

>>>>>>> 91517766b5bbbd52a76349a4368aef68139592e1
