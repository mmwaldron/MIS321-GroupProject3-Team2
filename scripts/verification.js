// Verification Flow Logic
let currentStep = 1;
let verificationData = {};
window.verificationData = verificationData; // Make accessible for CAPTCHA callback

// Helper function to safely get element value
function safeGetValue(elementId, defaultValue = '') {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id '${elementId}' not found`);
    return defaultValue;
  }
  return element.value || defaultValue;
}

// Global error handler for form submissions
window.addEventListener('error', function(e) {
  if (e.message && e.message.includes('Cannot read properties of null')) {
    console.error('Null reference error detected:', e);
    if (typeof showAlert === 'function') {
      showAlert('An error occurred. Please refresh the page and try again.', 'danger');
    }
  }
});

function goToStep(step) {
  // Hide all steps
  document.querySelectorAll('.step').forEach(s => {
    s.style.display = 'none';
    s.classList.remove('active');
  });

  // Show target step
  const stepId = step.toString().replace('.', '_');
  const targetStep = document.getElementById(`step${stepId}`);
  if (targetStep) {
    targetStep.style.display = 'block';
    targetStep.classList.add('active');
    currentStep = step;
    
    // Initialize CAPTCHA if we're on step 2.75
    if (step === 2.75 && typeof grecaptcha !== 'undefined' && !window.captchaWidgetId) {
      const captchaContainer = document.getElementById('captchaContainer');
      if (captchaContainer && captchaContainer.children.length === 0) {
        window.captchaWidgetId = grecaptcha.render('captchaContainer', {
          'sitekey': '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI', // Test key - replace with your actual key
          'callback': function(token) {
            const captchaSubmitBtn = document.getElementById('captchaSubmitBtn');
            if (captchaSubmitBtn) {
              captchaSubmitBtn.disabled = false;
            }
            if (window.verificationData) {
              window.verificationData.captchaToken = token;
            }
          },
          'expired-callback': function() {
            const captchaSubmitBtn = document.getElementById('captchaSubmitBtn');
            if (captchaSubmitBtn) {
              captchaSubmitBtn.disabled = true;
            }
            if (window.verificationData) {
              window.verificationData.captchaToken = null;
            }
          }
        });
      }
    }
  }
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Step 1: Basic Info
document.addEventListener('DOMContentLoaded', function() {
  // Ensure verificationData is initialized
  if (!verificationData || typeof verificationData !== 'object') {
    verificationData = {};
    window.verificationData = verificationData;
  }
  
  const basicInfoForm = document.getElementById('basicInfoForm');
  if (basicInfoForm) {
    basicInfoForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      try {
        // Get form elements with null checks
        const firstNameInput = document.getElementById('firstName');
        const lastNameInput = document.getElementById('lastName');
        const emailInput = document.getElementById('email');
        
        // Validate elements exist
        if (!firstNameInput) {
          console.error('firstName input not found');
          showAlert('First name field not found. Please refresh the page.', 'danger');
          return;
        }
        if (!lastNameInput) {
          console.error('lastName input not found');
          showAlert('Last name field not found. Please refresh the page.', 'danger');
          return;
        }
        if (!emailInput) {
          console.error('email input not found');
          showAlert('Email field not found. Please refresh the page.', 'danger');
          return;
        }
        
        // Get and validate first and last name individually
        const firstName = firstNameInput.value.trim() || '';
        const lastName = lastNameInput.value.trim() || '';
        
        // Validate that both first and last name are provided individually
        if (!firstName || firstName.length === 0) {
          showAlert('Please enter your first name.', 'danger');
          return;
        }
        if (!lastName || lastName.length === 0) {
          showAlert('Please enter your last name.', 'danger');
          return;
        }
        
        // Combine first and last name into full name
        const fullName = `${firstName} ${lastName}`.trim();
        
        verificationData = {
          name: fullName,
          firstName: firstName,
          lastName: lastName,
          email: emailInput.value || ''
        };
        window.verificationData = verificationData; // Update global reference
        goToStep(2);
      } catch (error) {
        console.error('Error in basic info form submission:', error);
        showAlert('An error occurred. Please refresh the page and try again.', 'danger');
      }
    });
  }

  // Step 2: Credentials
  const credentialsForm = document.getElementById('credentialsForm');
  if (credentialsForm) {
    credentialsForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      try {
        // Get form elements with null checks
        const fileInput = document.getElementById('verificationDoc');
        const companyEmailInput = document.getElementById('companyEmail');
        const govIdInput = document.getElementById('govId');
        
        // Validate elements exist
        if (!companyEmailInput) {
          console.error('Company email input not found');
          showAlert('Company email field not found. Please refresh the page.', 'danger');
          return;
        }
        
        if (!govIdInput) {
          console.error('Government ID input not found');
          showAlert('Government ID field not found. Please refresh the page.', 'danger');
          return;
        }
        
        const companyEmail = companyEmailInput.value || '';
      
      // Validate company email format
      if (!isValidEmail(companyEmail)) {
        showAlert('Please enter a valid company email address.', 'danger');
        return;
      }
      
        verificationData = {
          ...verificationData,
          govId: govIdInput.value || '',
          hasDocument: fileInput && fileInput.files.length > 0,
          companyEmail: companyEmail
        };
        window.verificationData = verificationData; // Update global reference
        
        try {
        // Run risk assessment
        const riskAssessment = RiskFilter.calculateRiskScore(verificationData);
        const urgency = RiskFilter.calculateUrgency(verificationData, riskAssessment.score);
        const credibility = RiskFilter.calculateCredibility(verificationData);
        const trustScore = TrustScore.calculateInitialScore(verificationData, riskAssessment);
        
        // Create pending user account
        showAlert('Creating your account...', 'info');
        const response = await API.registerPendingUser({
          name: verificationData.name,
          email: verificationData.email,
          phone: null, // Optional - not required
          organization: null, // Optional - not required
          govId: verificationData.govId || null,
          hasDocument: verificationData.hasDocument,
          companyEmail: companyEmail || null,
          riskScore: riskAssessment.score,
          riskLevel: riskAssessment.level,
          urgency: urgency,
          credibility: credibility,
          trustScore: trustScore,
          factors: riskAssessment.factors
        });
        
        if (response.success) {
          // Store user info in localStorage
          localStorage.setItem('currentUserId', response.userId);
          localStorage.setItem('currentUserEmail', verificationData.email);
          localStorage.setItem('userStatus', 'pending');
          localStorage.setItem('verificationId', response.verificationId);
          
          // Create alert for admin if high risk
          try {
            if (riskAssessment.level === 'high' || urgency > 70) {
              await API.createAlert({
                userId: response.userId,
                type: 'high_risk_verification',
                title: 'High Risk Verification Detected',
                message: `User ${verificationData.name} (${verificationData.email}) has been flagged for review.`,
                priority: 'high'
              });
            } else {
              await API.createAlert({
                userId: response.userId,
                type: 'new_verification',
                title: 'New Verification Request',
                message: `User ${verificationData.name} (${verificationData.email}) has submitted a verification request.`,
                priority: 'medium'
              });
            }
          } catch (alertError) {
            console.error('Failed to create alert:', alertError);
          }
          
          // Show processing step, then result
          goToStep(4);
          setTimeout(() => {
            goToStep(5);
            displayPendingApprovalResult(response.userId, response.verificationId);
          }, 1500);
        } else {
          const errorMsg = response.message || 'Failed to create account. Please try again.';
          console.error('Registration failed:', response);
          showAlert(errorMsg, 'danger');
        }
        } catch (error) {
          console.error('Error creating account:', error);
          console.error('Error details:', {
            message: error.message,
            response: error.response,
            status: error.status,
            stack: error.stack
          });
          
          // Extract error message from various possible sources
          let errorMsg = 'Failed to create account. Please try again.';
          if (error.message) {
            errorMsg = error.message;
          } else if (error.response?.message) {
            errorMsg = error.response.message;
          } else if (error.response?.error) {
            errorMsg = error.response.error;
          }
          
          showAlert(errorMsg, 'danger');
        }
      } catch (error) {
        console.error('Error in credentials form submission:', error);
        showAlert('An error occurred. Please refresh the page and try again.', 'danger');
      }
    });
  }

  // Step 2.5: Email Verification Code
  const emailVerificationForm = document.getElementById('emailVerificationForm');
  if (emailVerificationForm) {
    emailVerificationForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const codeInput = document.getElementById('emailVerificationCode');
      if (!codeInput) {
        console.error('Email verification code input not found');
        showAlert('Form field not found. Please refresh the page.', 'danger');
        return;
      }
      
      const code = codeInput.value.trim();
      
      if (!code || code.length < 6) {
        showAlert('Please enter a valid verification code.', 'danger');
        return;
      }
      
      if (!verificationData || !verificationData.companyEmail) {
        showAlert('Email information not found. Please start over.', 'danger');
        return;
      }
      
      try {
        const response = await API.verifyCompanyEmailCode(verificationData.companyEmail, code);
        
        if (response.success) {
          verificationData.emailVerified = true;
          goToStep(2.75);
        } else {
          showAlert(response.message || 'Invalid verification code. Please try again.', 'danger');
          codeInput.value = '';
        }
      } catch (error) {
        console.error('Error verifying code:', error);
        showAlert('Failed to verify code. Please try again.', 'danger');
      }
    });

    // Resend email code
    const resendEmailCodeBtn = document.getElementById('resendEmailCode');
    if (resendEmailCodeBtn) {
      resendEmailCodeBtn.addEventListener('click', async function() {
        if (!verificationData || !verificationData.companyEmail) {
          showAlert('Email information not found. Please start over.', 'danger');
          return;
        }
        
        try {
          showAlert('Resending verification code...', 'info');
          const response = await API.sendCompanyEmailVerification(verificationData.companyEmail);
          
          if (response.success) {
            const codeInput = document.getElementById('emailVerificationCode');
            if (codeInput) {
              codeInput.value = '';
            }
            showAlert('New verification code sent to your email.', 'success');
          } else {
            showAlert(response.message || 'Failed to resend code. Please try again.', 'danger');
          }
        } catch (error) {
          console.error('Error resending code:', error);
          showAlert('Failed to resend code. Please try again.', 'danger');
        }
      });
    }
  }

  // Step 2.75: CAPTCHA
  const captchaForm = document.getElementById('captchaForm');
  if (captchaForm) {
    captchaForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      if (!verificationData.captchaToken) {
        showAlert('Please complete the CAPTCHA verification.', 'danger');
        return;
      }
      
      try {
        // Verify CAPTCHA on server
        const response = await API.verifyCaptcha(verificationData.captchaToken);
        
        if (response.success) {
          verificationData.captchaVerified = true;
          // Generate and send MFA code for next step
          const mfaCode = generateMFACode();
          verificationData.mfaCode = mfaCode;
          verificationData.mfaCodeExpiry = Date.now() + (5 * 60 * 1000); // 5 minutes
          
          // Display MFA code (in production, this would be sent via email/SMS)
          const mfaCodeDisplay = document.getElementById('mfaCode');
          if (mfaCodeDisplay) {
            mfaCodeDisplay.textContent = mfaCode;
          }
          
          goToStep(3);
        } else {
          showAlert('CAPTCHA verification failed. Please try again.', 'danger');
          if (window.captchaWidgetId && typeof grecaptcha !== 'undefined') {
            grecaptcha.reset(window.captchaWidgetId);
          }
          const captchaSubmitBtn = document.getElementById('captchaSubmitBtn');
          if (captchaSubmitBtn) {
            captchaSubmitBtn.disabled = true;
          }
          verificationData.captchaToken = null;
        }
      } catch (error) {
        console.error('Error verifying CAPTCHA:', error);
        showAlert('Failed to verify CAPTCHA. Please try again.', 'danger');
        if (window.captchaWidgetId && typeof grecaptcha !== 'undefined') {
          grecaptcha.reset(window.captchaWidgetId);
        }
        const captchaSubmitBtn = document.getElementById('captchaSubmitBtn');
        if (captchaSubmitBtn) {
          captchaSubmitBtn.disabled = true;
        }
        verificationData.captchaToken = null;
      }
    });
  }

  // Step 3: MFA
  const mfaForm = document.getElementById('mfaForm');
  if (mfaForm) {
    mfaForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const mfaInput = document.getElementById('mfaInput');
      if (!mfaInput) {
        console.error('MFA input not found');
        showAlert('Form field not found. Please refresh the page.', 'danger');
        return;
      }
      
      const inputCode = mfaInput.value;
      
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
        try {
          const mfaCode = generateMFACode();
          if (!verificationData) {
            verificationData = {};
            window.verificationData = verificationData;
          }
          verificationData.mfaCode = mfaCode;
          verificationData.mfaCodeExpiry = Date.now() + (5 * 60 * 1000);
          
          const mfaCodeDisplay = document.getElementById('mfaCode');
          const mfaInput = document.getElementById('mfaInput');
          
          if (mfaCodeDisplay) {
            mfaCodeDisplay.textContent = mfaCode;
          }
          if (mfaInput) {
            mfaInput.value = '';
          }
          showAlert('New verification code sent.', 'success');
        } catch (error) {
          console.error('Error in resend MFA code:', error);
          showAlert('An error occurred. Please try again.', 'danger');
        }
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

async function completeVerification() {
  try {
    // Check if user already exists, if not create one
    let user;
    try {
      user = await API.getUserByEmail(verificationData.email);
    } catch (error) {
      // User doesn't exist, create one
      try {
        user = await API.createUser({
          email: verificationData.email,
          password: 'temp' // In a real app, user would set password during registration
        });
      } catch (createError) {
        showAlert('Failed to create user account. Please try again.', 'danger');
        return;
      }
    }

    // Run risk assessment
    const riskAssessment = RiskFilter.calculateRiskScore(verificationData);
    const urgency = RiskFilter.calculateUrgency(verificationData, riskAssessment.score);
    const credibility = RiskFilter.calculateCredibility(verificationData);

    // Calculate trust score
    const trustScore = TrustScore.calculateInitialScore(verificationData, riskAssessment);

    // Create verification record via API
    const verification = await API.createVerification({
      userId: user.id,
      name: verificationData.name,
      email: verificationData.email,
      phone: null, // Optional - not required, phone field was removed from form
      organization: null, // Optional - not required, organization field was removed from form
      govId: verificationData.govId || null,
      hasDocument: verificationData.hasDocument,
      companyEmail: verificationData.companyEmail || null,
      riskScore: riskAssessment.score,
      riskLevel: riskAssessment.level,
      urgency,
      credibility,
      trustScore,
      factors: riskAssessment.factors
    });

    // Create alert for admin if high risk
    try {
      if (riskAssessment.level === 'high' || urgency > 70) {
        await API.createAlert({
          userId: user.id,
          type: 'high_risk_verification',
          title: 'High Risk Verification Detected',
          message: `User ${verificationData.name} (${verificationData.email}) has been flagged for review.`,
          priority: 'high'
        });
      } else {
        await API.createAlert({
          userId: user.id,
          type: 'new_verification',
          title: 'New Verification Request',
          message: `User ${verificationData.name} (${verificationData.email}) has submitted a verification request.`,
          priority: 'medium'
        });
      }
    } catch (alertError) {
      console.error('Failed to create alert:', alertError);
    }

    // Show result
    goToStep(5);
    displayVerificationResult(user, verification, riskAssessment);
  } catch (error) {
    console.error('Verification failed:', error);
    showAlert('Failed to complete verification. Please try again.', 'danger');
  }
}

function displayPendingApprovalResult(userId, verificationId) {
  const resultIcon = document.getElementById('resultIcon');
  const resultTitle = document.getElementById('resultTitle');
  const resultMessage = document.getElementById('resultMessage');
  const resultActions = document.getElementById('resultActions');

  if (!resultIcon || !resultTitle || !resultMessage || !resultActions) {
    console.error('Result display elements not found');
    return;
  }

  resultIcon.innerHTML = '<i class="bi bi-hourglass-split text-warning" style="font-size: 4rem;"></i>';
  resultTitle.textContent = 'Account Pending Approval';
  resultTitle.className = 'mb-3 text-warning';
  resultMessage.innerHTML = `
    <p>Your account has been created and is pending admin approval.</p>
    <p class="mb-0">You are logged in, but access to the portal is restricted until your account is approved.</p>
    <p class="mt-2 mb-0"><strong>Once approved, you will receive your 10-digit passport code here.</strong></p>
  `;
  resultActions.innerHTML = `
    <button class="btn btn-success" onclick="window.location.href='dashboard.html'">
      Go to Dashboard
    </button>
    <button class="btn btn-outline-secondary ms-2" onclick="checkAccountStatus()">
      Check Status
    </button>
  `;
}

function displayVerificationResult(user, verification, riskAssessment) {
  const resultIcon = document.getElementById('resultIcon');
  const resultTitle = document.getElementById('resultTitle');
  const resultMessage = document.getElementById('resultMessage');
  const resultActions = document.getElementById('resultActions');

  if (!resultIcon || !resultTitle || !resultMessage || !resultActions) {
    console.error('Result display elements not found');
    return;
  }

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
  localStorage.setItem('verificationId', verification.id);
}

async function checkAccountStatus() {
  const userId = localStorage.getItem('currentUserId');
  if (!userId) {
    showAlert('No user session found. Please register again.', 'warning');
    return;
  }

  try {
    const user = await API.getUser(userId);
    if (user.verified) {
      // User is approved, check for passport code
      const verifications = await API.getVerificationsByUserId(userId);
      const latestVerification = verifications && verifications.length > 0 ? verifications[0] : null;
      
      if (latestVerification && latestVerification.status === 'approved') {
        // Get passport code from passport endpoint
        try {
          // The passport code would be available after admin approval
          showAlert('Your account has been approved! Redirecting to dashboard...', 'success');
          localStorage.setItem('userStatus', 'approved');
          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 1500);
        } catch (error) {
          showAlert('Account approved! Redirecting to dashboard...', 'success');
          localStorage.setItem('userStatus', 'approved');
          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 1500);
        }
      } else {
        showAlert('Your account is still pending approval.', 'info');
      }
    } else {
      showAlert('Your account is still pending approval.', 'info');
    }
  } catch (error) {
    console.error('Error checking account status:', error);
    showAlert('Failed to check account status. Please try again.', 'danger');
  }
}

// Make checkAccountStatus available globally
window.checkAccountStatus = checkAccountStatus;

async function updateTrustScoreDisplay(userId) {
  try {
    const user = await API.getUser(userId);
    if (!user) return;

    // Get verification for trust score
    const verifications = await API.getVerificationsByUserId(userId);
    const latestVerification = verifications && verifications.length > 0 ? verifications[0] : null;
    const trustScore = latestVerification?.trustScore || 0;

    const scoreValue = document.getElementById('trustScoreValue');
    const scoreTier = document.getElementById('scoreTier');
    const scoreAccess = document.getElementById('scoreAccess');
    const scoreCircle = document.getElementById('scoreCircle');

    if (scoreValue) scoreValue.textContent = trustScore;
    if (scoreTier) scoreTier.textContent = TrustScore.getTier(trustScore);
    if (scoreAccess) {
      const permissions = TrustScore.getAccessPermissions(trustScore);
      scoreAccess.textContent = permissions.dataAccess.charAt(0).toUpperCase() + permissions.dataAccess.slice(1) + ' Access';
    }
    if (scoreCircle) {
      scoreCircle.style.background = `conic-gradient(#28a745 ${trustScore * 3.6}deg, #333 ${trustScore * 3.6}deg)`;
    }
  } catch (error) {
    console.error('Failed to update trust score display:', error);
  }
}
