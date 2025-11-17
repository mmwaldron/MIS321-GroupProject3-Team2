// Verification Flow Logic
let currentStep = 1;
let verificationData = {};

function goToStep(step) {
  // Hide all steps
  document.querySelectorAll('.step').forEach(s => {
    s.style.display = 'none';
    s.classList.remove('active');
  });

  // Show target step
  const targetStep = document.getElementById(`step${step}`);
  if (targetStep) {
    targetStep.style.display = 'block';
    targetStep.classList.add('active');
    currentStep = step;
  }
}

// Step 1: Basic Info
document.addEventListener('DOMContentLoaded', function() {
  const basicInfoForm = document.getElementById('basicInfoForm');
  if (basicInfoForm) {
    basicInfoForm.addEventListener('submit', function(e) {
      e.preventDefault();
      verificationData = {
        name: document.getElementById('fullName').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        organization: document.getElementById('organization').value
      };
      goToStep(2);
    });
  }

  // Step 2: Credentials
  const credentialsForm = document.getElementById('credentialsForm');
  if (credentialsForm) {
    credentialsForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const fileInput = document.getElementById('verificationDoc');
      verificationData = {
        ...verificationData,
        govId: document.getElementById('govId').value,
        hasDocument: fileInput.files.length > 0,
        license: document.getElementById('license').value || null
      };
      
      // Generate and send MFA code
      const mfaCode = generateMFACode();
      verificationData.mfaCode = mfaCode;
      verificationData.mfaCodeExpiry = Date.now() + (5 * 60 * 1000); // 5 minutes
      
      // Display MFA code (in production, this would be sent via email/SMS)
      document.getElementById('mfaCode').textContent = mfaCode;
      
      goToStep(3);
    });
  }

  // Step 3: MFA
  const mfaForm = document.getElementById('mfaForm');
  if (mfaForm) {
    mfaForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const inputCode = document.getElementById('mfaInput').value;
      
      if (inputCode === verificationData.mfaCode) {
        verificationData.mfaVerified = true;
        processVerification();
      } else {
        showAlert('Invalid verification code. Please try again.', 'danger');
      }
    });

    // Resend code
    const resendBtn = document.getElementById('resendCode');
    if (resendBtn) {
      resendBtn.addEventListener('click', function() {
        const mfaCode = generateMFACode();
        verificationData.mfaCode = mfaCode;
        verificationData.mfaCodeExpiry = Date.now() + (5 * 60 * 1000);
        document.getElementById('mfaCode').textContent = mfaCode;
        document.getElementById('mfaInput').value = '';
        showAlert('New verification code sent.', 'success');
      });
    }
  }
});

function generateMFACode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function processVerification() {
  goToStep(4);
  
  // Simulate processing with progress bar
  let progress = 0;
  const progressBar = document.getElementById('progressBar');
  const interval = setInterval(() => {
    progress += Math.random() * 15;
    if (progress > 100) progress = 100;
    progressBar.style.width = progress + '%';
    
    if (progress >= 100) {
      clearInterval(interval);
      setTimeout(() => {
        completeVerification();
      }, 500);
    }
  }, 300);
}

function completeVerification() {
  // Check if user already exists
  let user = Database.getUserByEmail(verificationData.email);
  
  if (!user) {
    user = Database.createUser({
      name: verificationData.name,
      email: verificationData.email,
      phone: verificationData.phone,
      organization: verificationData.organization
    });
  }

  // Run risk assessment
  const riskAssessment = RiskFilter.calculateRiskScore(verificationData);
  const urgency = RiskFilter.calculateUrgency(verificationData, riskAssessment.score);
  const credibility = RiskFilter.calculateCredibility(verificationData);

  // Calculate trust score
  const trustScore = TrustScore.calculateInitialScore(verificationData, riskAssessment);

  // Create verification record
  const verification = Database.createVerification({
    userId: user.id,
    ...verificationData,
    riskScore: riskAssessment.score,
    riskLevel: riskAssessment.level,
    urgency,
    credibility,
    trustScore
  });

  // Update user with verification data
  Database.updateUser(user.id, {
    trustScore,
    verificationId: verification.id
  });

  // Create alert for admin if high risk
  if (riskAssessment.level === 'high' || urgency > 70) {
    Database.createAlert({
      type: 'high_risk_verification',
      title: 'High Risk Verification Detected',
      message: `User ${user.name} (${user.email}) has been flagged for review.`,
      userId: user.id,
      verificationId: verification.id,
      priority: 'high'
    });
  } else {
    Database.createAlert({
      type: 'new_verification',
      title: 'New Verification Request',
      message: `User ${user.name} (${user.email}) has submitted a verification request.`,
      userId: user.id,
      verificationId: verification.id,
      priority: 'medium'
    });
  }

  // Show result
  goToStep(5);
  displayVerificationResult(user, verification, riskAssessment);
}

function displayVerificationResult(user, verification, riskAssessment) {
  const resultIcon = document.getElementById('resultIcon');
  const resultTitle = document.getElementById('resultTitle');
  const resultMessage = document.getElementById('resultMessage');
  const resultActions = document.getElementById('resultActions');

  // Always require admin review - no auto-approval
  resultIcon.innerHTML = '<i class="bi bi-hourglass-split text-warning" style="font-size: 4rem;"></i>';
  resultTitle.textContent = 'Under Review';
  resultTitle.className = 'mb-3 text-warning';
  resultMessage.textContent = 'Your verification is under review by our security team. Once approved, you will receive a 10-digit passport code to access your BioTrust Passport.';
  resultActions.innerHTML = `
    <button class="btn btn-outline-success" onclick="window.location.reload()">
      Check Status Later
    </button>
  `;

  // Store current user for later
  localStorage.setItem('currentUserId', user.id);
}

function updateTrustScoreDisplay(userId) {
  const user = Database.getUser(userId);
  if (!user) return;

  const scoreValue = document.getElementById('trustScoreValue');
  const scoreTier = document.getElementById('scoreTier');
  const scoreAccess = document.getElementById('scoreAccess');
  const scoreCircle = document.getElementById('scoreCircle');

  if (scoreValue) scoreValue.textContent = user.trustScore || 0;
  if (scoreTier) scoreTier.textContent = TrustScore.getTier(user.trustScore || 0);
  if (scoreAccess) {
    const permissions = TrustScore.getAccessPermissions(user.trustScore || 0);
    scoreAccess.textContent = permissions.dataAccess.charAt(0).toUpperCase() + permissions.dataAccess.slice(1) + ' Access';
  }
  if (scoreCircle) {
    const score = user.trustScore || 0;
    scoreCircle.style.background = `conic-gradient(#28a745 ${score * 3.6}deg, #333 ${score * 3.6}deg)`;
  }
}

