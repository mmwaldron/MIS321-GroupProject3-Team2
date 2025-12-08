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
    
    // Initialize CAPTCHA if we're on step 1
    if (step === 1 && typeof grecaptcha !== 'undefined' && !window.captchaWidgetId) {
      const captchaContainer = document.getElementById('captchaContainer');
      if (captchaContainer && captchaContainer.children.length === 0) {
        // Get site key from environment or use test key
        const siteKey = '6LesjSQsAAAAAIF02PbHdIa9j5ds-JvTxpWYp1Zh'; // Test key - replace with your actual key from environment
        
        window.captchaWidgetId = grecaptcha.render('captchaContainer', {
          'sitekey': siteKey,
          'callback': function(token) {
            const basicInfoSubmitBtn = document.getElementById('basicInfoSubmitBtn');
            if (basicInfoSubmitBtn) {
              basicInfoSubmitBtn.disabled = false;
            }
            if (window.verificationData) {
              window.verificationData.captchaToken = token;
            }
          },
          'expired-callback': function() {
            const basicInfoSubmitBtn = document.getElementById('basicInfoSubmitBtn');
            if (basicInfoSubmitBtn) {
              basicInfoSubmitBtn.disabled = true;
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
  
  // Initialize CAPTCHA on page load if Step 1 is active
  function initializeCaptcha() {
    if (currentStep === 1 && !window.captchaWidgetId) {
      const captchaContainer = document.getElementById('captchaContainer');
      if (captchaContainer && captchaContainer.children.length === 0) {
        if (typeof grecaptcha !== 'undefined') {
          const siteKey = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'; // Test key - replace with your actual key
          
          window.captchaWidgetId = grecaptcha.render('captchaContainer', {
            'sitekey': siteKey,
            'callback': function(token) {
              const basicInfoSubmitBtn = document.getElementById('basicInfoSubmitBtn');
              if (basicInfoSubmitBtn) {
                basicInfoSubmitBtn.disabled = false;
              }
              if (window.verificationData) {
                window.verificationData.captchaToken = token;
              }
            },
            'expired-callback': function() {
              const basicInfoSubmitBtn = document.getElementById('basicInfoSubmitBtn');
              if (basicInfoSubmitBtn) {
                basicInfoSubmitBtn.disabled = true;
              }
              if (window.verificationData) {
                window.verificationData.captchaToken = null;
              }
            }
          });
        } else {
          // reCAPTCHA script not loaded yet, try again
          setTimeout(initializeCaptcha, 200);
        }
      }
    }
  }
  
  // Try to initialize CAPTCHA after a short delay to ensure script is loaded
  setTimeout(initializeCaptcha, 500);
  
  const basicInfoForm = document.getElementById('basicInfoForm');
  if (basicInfoForm) {
    basicInfoForm.addEventListener('submit', async function(e) {
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
        
        // Validate CAPTCHA is completed
        if (!verificationData.captchaToken) {
          showAlert('Please complete the security verification (CAPTCHA) before continuing.', 'danger');
          return;
        }
        
        // Verify CAPTCHA on server before proceeding
        try {
          const captchaResponse = await API.verifyCaptcha(verificationData.captchaToken);
          if (!captchaResponse.success) {
            showAlert('Security verification failed. Please try again.', 'danger');
            // Reset CAPTCHA
            if (window.captchaWidgetId && typeof grecaptcha !== 'undefined') {
              grecaptcha.reset(window.captchaWidgetId);
            }
            const basicInfoSubmitBtn = document.getElementById('basicInfoSubmitBtn');
            if (basicInfoSubmitBtn) {
              basicInfoSubmitBtn.disabled = true;
            }
            verificationData.captchaToken = null;
            return;
          }
        } catch (captchaError) {
          console.error('Error verifying CAPTCHA:', captchaError);
          showAlert('Failed to verify security check. Please try again.', 'danger');
          // Reset CAPTCHA
          if (window.captchaWidgetId && typeof grecaptcha !== 'undefined') {
            grecaptcha.reset(window.captchaWidgetId);
          }
          const basicInfoSubmitBtn = document.getElementById('basicInfoSubmitBtn');
          if (basicInfoSubmitBtn) {
            basicInfoSubmitBtn.disabled = true;
          }
          verificationData.captchaToken = null;
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
          email: emailInput.value || '',
          captchaToken: verificationData.captchaToken, // Keep CAPTCHA token for backend verification
          captchaVerified: true
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
        const idTypeSelect = document.getElementById('idType');
        const fileInput = document.getElementById('verificationDoc');
        const companyEmailInput = document.getElementById('companyEmail');
        const govIdInput = document.getElementById('govId');
        const idNumberInput = document.getElementById('idNumber');
        
        // Validate elements exist
        if (!idTypeSelect) {
          console.error('ID type select not found');
          showAlert('ID type field not found. Please refresh the page.', 'danger');
          return;
        }
        
        if (!fileInput) {
          console.error('File input not found');
          showAlert('Document upload field not found. Please refresh the page.', 'danger');
          return;
        }
        
        if (!companyEmailInput) {
          console.error('Company email input not found');
          showAlert('Company email field not found. Please refresh the page.', 'danger');
          return;
        }
        
        // Validate ID type selected
        if (!idTypeSelect.value) {
          showAlert('Please select your government ID type', 'danger');
          return;
        }
        
        // Validate file uploaded
        if (!fileInput.files || fileInput.files.length === 0) {
          showAlert('Please upload your government-issued ID', 'danger');
          return;
        }
        
        const file = fileInput.files[0];
        
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
          showAlert('Invalid file type. Please upload JPG, PNG, or PDF', 'danger');
          return;
        }
        
        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          showAlert('File size exceeds 10MB limit', 'danger');
          return;
        }
        
        const companyEmail = companyEmailInput.value || '';
        const govId = govIdInput ? govIdInput.value || '' : '';
        
        // Get or create user first
        let userId;
        let verificationId;
        
        try {
          // Check if user exists
          let user;
          try {
            user = await API.getUserByEmail(verificationData.email);
            userId = user.id;
          } catch (error) {
            // User doesn't exist, create one
            const createUserResponse = await API.createUser({
              email: verificationData.email,
              password: '' // No password needed for QR-based auth
            });
            userId = createUserResponse.id;
          }
          
          // Upload and analyze document
          showAlert('Uploading and analyzing your ID...', 'info');
          
          const formData = new FormData();
          formData.append('document', file);
          formData.append('idType', idTypeSelect.value);
          formData.append('userId', userId);
          
          const uploadResponse = await fetch(API_CONFIG.getUrl('/verifications/upload-id'), {
            method: 'POST',
            body: formData
          });
          
          const uploadResult = await uploadResponse.json();
          
          if (!uploadResult.success) {
            showAlert(uploadResult.message || 'Failed to upload ID', 'danger');
            return;
          }
          
          verificationId = uploadResult.verificationId;
          const idAnalysis = uploadResult.analysis;
          const documentAnalysis = uploadResult.documentAnalysis;
          
          console.log('Document uploaded successfully. Verification ID:', verificationId, 'Document ID:', uploadResult.documentId);
          
          // Store extracted ID number if available
          const extractedIdNumber = idAnalysis.extractedFields?.idNumber || idNumberInput?.value || '';
          
          verificationData = {
            ...verificationData,
            idType: idTypeSelect.value,
            documentId: uploadResult.documentId,
            idAnalysis: idAnalysis,
            documentAnalysis: documentAnalysis,
            idNumber: extractedIdNumber,
            govId: govId,
            hasDocument: true,
            companyEmail: companyEmail
          };
          window.verificationData = verificationData;
          
          // Check if ID validation passed
          if (!idAnalysis.isValid) {
            const highRiskFlags = idAnalysis.flags.filter(f => f.severity === 'high');
            if (highRiskFlags.length > 0) {
              showAlert(
                `ID validation warning: ${highRiskFlags[0].message}. Your verification will require manual review.`,
                'warning'
              );
            }
          }
          
          // Run risk assessment
          const riskAssessment = RiskFilter.calculateRiskScore(verificationData);
          const urgency = RiskFilter.calculateUrgency(verificationData, riskAssessment.score);
          const credibility = RiskFilter.calculateCredibility(verificationData);
          const trustScore = TrustScore.calculateInitialScore(verificationData, riskAssessment);
          
          // Update verification record with full data
          // Pass the verificationId from document upload so documents stay linked
          showAlert('Completing verification...', 'info');
          const response = await API.registerPendingUser({
            name: verificationData.name,
            email: verificationData.email,
            phone: null,
            organization: null,
            govId: govId || extractedIdNumber || null,
            hasDocument: true,
            companyEmail: companyEmail || null,
            riskScore: riskAssessment.score,
            riskLevel: riskAssessment.level,
            urgency: urgency,
            credibility: credibility,
            trustScore: trustScore,
            factors: riskAssessment.factors,
            verificationId: verificationId, // Pass the verification ID from document upload
            captchaToken: verificationData.captchaToken // Pass CAPTCHA token for backend verification
          });
        
        if (response.success) {
          // DO NOT store currentUserId - user is not logged in until they use QR code
          // Only store email and verificationId for status checking purposes
          localStorage.setItem('currentUserEmail', verificationData.email);
          localStorage.setItem('userStatus', 'pending');
          localStorage.setItem('verificationId', response.verificationId);
          // Clear any existing userId to ensure user is not considered "logged in"
          localStorage.removeItem('currentUserId');
          localStorage.removeItem('userClassification');
          
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
            goToStep(4);
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
    goToStep(4);
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
  resultTitle.textContent = 'Verification Submitted';
  resultTitle.className = 'mb-3 text-warning';
  resultMessage.innerHTML = `
    <p>Your verification request has been submitted successfully.</p>
    <p class="mb-0">Your account is pending admin approval.</p>
    <p class="mt-2 mb-0"><strong>Once approved, you will receive your QR Passport from the admin.</strong></p>
    <p class="mt-2 mb-0 text-muted"><small>You can check your status anytime using the "Check Verification Status" section above.</small></p>
  `;
  resultActions.innerHTML = `
    <button class="btn btn-outline-light btn-lg px-4" onclick="returnToHome()">
      <i class="bi bi-house"></i> Return Home
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
  resultTitle.textContent = 'Verification Submitted';
  resultTitle.className = 'mb-3 text-warning';
  resultMessage.innerHTML = `
    <p>Your verification request has been submitted successfully.</p>
    <p class="mb-0">Your account is pending admin approval.</p>
    <p class="mt-2 mb-0"><strong>Once approved, you will receive your QR Passport from the admin.</strong></p>
    <p class="mt-2 mb-0 text-muted"><small>You can check your status anytime using the "Check Verification Status" section above.</small></p>
  `;
  resultActions.innerHTML = `
    <button class="btn btn-outline-light btn-lg px-4" onclick="returnToHome()">
      <i class="bi bi-house"></i> Return Home
    </button>
  `;

  // DO NOT store currentUserId - user is not logged in until they use QR code
  // Only store verificationId for status checking purposes
  localStorage.setItem('verificationId', verification.id);
  // Clear any existing userId to ensure user is not considered "logged in"
  localStorage.removeItem('currentUserId');
  localStorage.removeItem('userClassification');
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
      // User is approved, check verification status
      const verifications = await API.getVerificationsByUserId(userId);
      const latestVerification = verifications && verifications.length > 0 ? verifications[0] : null;
      
      if (latestVerification && latestVerification.status === 'approved') {
        // User is approved - but they must log in with QR code to access dashboard
        showAlert('Your account has been approved! Please log in with your QR Passport to access the dashboard.', 'success');
        localStorage.setItem('userStatus', 'approved');
        // Don't route to dashboard - user must log in with QR code first
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

// Check verification status by email
async function checkVerificationStatus(event) {
  if (event) {
    event.preventDefault();
  }

  const emailInput = document.getElementById('statusCheckEmail');
  const resultDiv = document.getElementById('statusCheckResult');
  
  if (!emailInput || !resultDiv) {
    console.error('Status check elements not found');
    return;
  }

  const email = emailInput.value.trim();
  if (!email) {
    showAlert('Please enter an email address', 'warning');
    return;
  }

  try {
    // Show loading state
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `
      <div class="text-center py-3">
        <div class="spinner-border text-success" role="status">
          <span class="visually-hidden">Checking...</span>
        </div>
        <p class="mt-2 text-muted">Checking status...</p>
      </div>
    `;

    // Get user by email
    let user;
    try {
      user = await API.getUserByEmail(email);
    } catch (error) {
      // User not found - this is expected for users who haven't registered
      console.log('User not found for email:', email);
      resultDiv.innerHTML = `
        <div class="card bg-dark border-warning">
          <div class="card-body text-center py-4">
            <i class="bi bi-exclamation-circle text-warning" style="font-size: 3rem;"></i>
            <h5 class="mt-3 mb-2 text-warning">Not on Record</h5>
            <p class="text-muted mb-0">No verification request found for this email address.</p>
            <p class="text-muted mt-2 mb-0"><small>If you believe this is an error, please submit a new verification request below.</small></p>
          </div>
        </div>
      `;
      return;
    }

    // Get verifications for this user
    let verifications = [];
    try {
      verifications = await API.getVerificationsByUserId(user.id);
    } catch (error) {
      console.error('Failed to fetch verifications:', error);
    }

    const latestVerification = verifications && verifications.length > 0 ? verifications[0] : null;

    if (!latestVerification) {
      // No verification found
      resultDiv.innerHTML = `
        <div class="card bg-dark border-warning">
          <div class="card-body text-center py-4">
            <i class="bi bi-exclamation-circle text-warning" style="font-size: 3rem;"></i>
            <h5 class="mt-3 mb-2 text-warning">Not on Record</h5>
            <p class="text-muted mb-0">No verification request found for this email address.</p>
            <p class="text-muted mt-2 mb-0"><small>If you believe this is an error, please submit a new verification request below.</small></p>
          </div>
        </div>
      `;
      return;
    }

    // Check verification status
    if (latestVerification.status === 'approved' && user.verified) {
      // Approved
      resultDiv.innerHTML = `
        <div class="card bg-dark border-success">
          <div class="card-body text-center py-4">
            <i class="bi bi-check-circle text-success" style="font-size: 3rem;"></i>
            <h5 class="mt-3 mb-2 text-success">Verification Approved</h5>
            <p class="text-muted mb-2">Your verification has been approved!</p>
            <p class="text-success mb-0"><strong>You should be receiving your login credentials (QR Passport) from the admin shortly.</strong></p>
            <p class="text-muted mt-3 mb-0"><small>Once you receive your QR Passport, you can use it to log in to your account.</small></p>
          </div>
        </div>
      `;
    } else if (latestVerification.status === 'pending') {
      // Pending
      resultDiv.innerHTML = `
        <div class="card bg-dark border-warning">
          <div class="card-body text-center py-4">
            <i class="bi bi-hourglass-split text-warning" style="font-size: 3rem;"></i>
            <h5 class="mt-3 mb-2 text-warning">Verification Pending</h5>
            <p class="text-muted mb-2">Your verification request is currently under review.</p>
            <p class="text-muted mb-0"><strong>Please wait for admin approval. You will receive your QR Passport once your verification is approved.</strong></p>
            <p class="text-muted mt-3 mb-0"><small>You can check back here anytime to see your status.</small></p>
          </div>
        </div>
      `;
    } else if (latestVerification.status === 'rejected' || latestVerification.status === 'denied') {
      // Rejected
      resultDiv.innerHTML = `
        <div class="card bg-dark border-danger">
          <div class="card-body text-center py-4">
            <i class="bi bi-x-circle text-danger" style="font-size: 3rem;"></i>
            <h5 class="mt-3 mb-2 text-danger">Verification Denied</h5>
            <p class="text-muted mb-0">Your verification request has been denied.</p>
            <p class="text-muted mt-2 mb-0"><small>If you believe this is an error, please contact support or submit a new verification request.</small></p>
          </div>
        </div>
      `;
    } else {
      // Unknown status
      resultDiv.innerHTML = `
        <div class="card bg-dark border-secondary">
          <div class="card-body text-center py-4">
            <i class="bi bi-question-circle text-secondary" style="font-size: 3rem;"></i>
            <h5 class="mt-3 mb-2">Status Unknown</h5>
            <p class="text-muted mb-0">Unable to determine verification status. Please contact support.</p>
          </div>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error checking verification status:', error);
    resultDiv.innerHTML = `
      <div class="card bg-dark border-danger">
        <div class="card-body text-center py-4">
          <i class="bi bi-exclamation-triangle text-danger" style="font-size: 3rem;"></i>
          <h5 class="mt-3 mb-2 text-danger">Error</h5>
          <p class="text-muted mb-0">Failed to check verification status. Please try again.</p>
        </div>
      </div>
    `;
  }
}

// Make checkVerificationStatus available globally
window.checkVerificationStatus = checkVerificationStatus;

// Return to home page (clears any login state)
function returnToHome() {
  // Clear any login-related localStorage items
  localStorage.removeItem('currentUserId');
  localStorage.removeItem('userClassification');
  // Keep verificationId and email for status checking
  // Navigate to index.html
  window.location.href = 'index.html';
}

// Make returnToHome available globally
window.returnToHome = returnToHome;

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
