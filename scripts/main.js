// Main Application Logic
function showAlert(message, type = 'info') {
  const alertContainer = document.getElementById('alertContainer');
  if (!alertContainer) {
    console.warn('Alert container not found. Creating fallback alert.');
    // Fallback: use browser alert if container doesn't exist
    alert(message);
    return;
  }

  const alertId = 'alert-' + Date.now();
  const alert = document.createElement('div');
  alert.id = alertId;
  alert.className = `alert alert-${type} alert-dismissible fade show alert-notification`;
  alert.setAttribute('role', 'alert');
  alert.innerHTML = `
    <div style="flex: 1; padding-right: 1rem;">
      ${message}
    </div>
    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="alert" aria-label="Close"></button>
  `;

  alertContainer.appendChild(alert);

  // Scroll alert into view if needed
  alert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Auto-dismiss after 7 seconds (increased from 5 for better visibility)
  setTimeout(() => {
    const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
    if (bsAlert) {
      bsAlert.close();
    } else {
      // Fallback if Bootstrap alert instance not available
      alert.style.opacity = '0';
      alert.style.transform = 'translateX(120%)';
      setTimeout(() => {
        if (alert.parentNode) {
          alert.parentNode.removeChild(alert);
        }
      }, 400);
    }
  }, 7000);
}

// Format passport code input (numbers only)
function formatPassportCode(input) {
  // Remove any non-numeric characters
  input.value = input.value.replace(/\D/g, '').slice(0, 10);
}

// Handle QR code upload
async function handleQRUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    showAlert('Processing QR code...', 'info');
    
    // Create image element to decode QR
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    img.onload = async function() {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Use jsQR to decode (loaded via CDN)
      if (typeof jsQR === 'undefined') {
        showAlert('QR code decoder not loaded. Please refresh the page.', 'danger');
        return;
      }
      
      const qrCode = jsQR(imageData.data, imageData.width, imageData.height);
      
      if (!qrCode) {
        showAlert('Could not decode QR code. Please ensure the image is clear and try again.', 'danger');
        return;
      }
      
      const code = qrCode.data.trim();
      
      // Verify the code format
      if (!code || code.length !== 10 || !/^\d{10}$/.test(code)) {
        showAlert('Invalid passport code in QR code. Please contact admin.', 'danger');
        return;
      }
      
      // Verify and login with the code
      try {
        const passport = await API.verifyQRCode(code);
        
        if (!passport || !passport.verified) {
          showAlert('This passport has not been verified yet. Please wait for admin approval.', 'warning');
          return;
        }

        // Store code and check user classification
        localStorage.setItem('currentPassportCode', code);
        localStorage.setItem('currentUserId', passport.userId);
        
        // Get user details to check classification
        try {
          const user = await API.getUser(passport.userId);
          if (user && user.classification === 'admin') {
            localStorage.setItem('userClassification', 'admin');
            window.location.href = 'admin.html';
          } else {
            localStorage.setItem('userClassification', 'user');
            window.location.href = 'dashboard.html';
          }
        } catch (error) {
          // Default to dashboard if classification check fails
          localStorage.setItem('userClassification', 'user');
          window.location.href = 'dashboard.html';
        }
      } catch (error) {
        showAlert('Invalid QR code. Please verify the file and try again.', 'danger');
      }
    };
    
    img.onerror = function() {
      showAlert('Failed to load image. Please ensure it is a valid image file.', 'danger');
    };
    
    img.src = URL.createObjectURL(file);
  } catch (error) {
    console.error('Error processing QR code:', error);
    showAlert('Error processing QR code. Please try again.', 'danger');
  }
}

// Lookup passport by code
async function lookupPassport(event) {
  event.preventDefault();
  
  const passportCodeInput = document.getElementById('passportCodeInput');
  if (!passportCodeInput) {
    console.error('Passport code input not found');
    showAlert('Form field not found. Please refresh the page.', 'danger');
    return;
  }
  
  const code = passportCodeInput.value.trim();
  
  if (!code || code.length !== 10 || !/^\d{10}$/.test(code)) {
    showAlert('Please enter a valid 10-digit passport code.', 'danger');
    return;
  }

  try {
    // Find passport by code via API
    const passport = await API.getPassportByCode(code);
    
    if (!passport || !passport.verified) {
      showAlert('This passport has not been verified yet. Please wait for admin approval.', 'warning');
      return;
    }

    // Store code and check user classification
    localStorage.setItem('currentPassportCode', code);
    localStorage.setItem('currentUserId', passport.userId);
    
    // Get user details to check classification
    try {
      const user = await API.getUser(passport.userId);
      if (user && user.classification === 'admin') {
        localStorage.setItem('userClassification', 'admin');
        window.location.href = 'admin.html';
      } else {
        localStorage.setItem('userClassification', 'user');
        window.location.href = 'dashboard.html';
      }
    } catch (error) {
      // Default to dashboard if classification check fails
      localStorage.setItem('userClassification', 'user');
      window.location.href = 'dashboard.html';
    }
  } catch (error) {
    showAlert('Passport code not found. Please verify your code and try again.', 'danger');
  }
}

// Check user status and display banner
async function checkUserStatus() {
  const userId = localStorage.getItem('currentUserId');
  if (!userId) return;

  try {
    const user = await API.getUser(userId);
    const statusBanner = document.getElementById('userStatusBanner');
    const pendingCard = document.getElementById('pendingStatusCard');
    const approvedCard = document.getElementById('approvedStatusCard');
    
    if (!statusBanner || !pendingCard || !approvedCard) return;

    if (user.verified) {
      // User is approved - show approved status
      statusBanner.style.display = 'block';
      pendingCard.style.display = 'none';
      approvedCard.style.display = 'block';
      // QR Passport will be provided by admin after approval
      
      localStorage.setItem('userStatus', 'approved');
    } else {
      // User is pending
      statusBanner.style.display = 'block';
      pendingCard.style.display = 'block';
      approvedCard.style.display = 'none';
      localStorage.setItem('userStatus', 'pending');
    }
  } catch (error) {
    console.error('Error checking user status:', error);
    // Clear invalid session
    localStorage.removeItem('currentUserId');
    localStorage.removeItem('userStatus');
  }
}

// Admin login function
async function adminLogin(event) {
  event.preventDefault();
  
  const emailInput = document.getElementById('adminEmail');
  const passwordInput = document.getElementById('adminPassword');
  
  if (!emailInput || !passwordInput) {
    showAlert('Admin login form not found.', 'danger');
    return;
  }
  
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  
  if (!email) {
    showAlert('Please enter an admin email address.', 'danger');
    return;
  }
  
  if (!password) {
    showAlert('Please enter your password.', 'danger');
    return;
  }
  
  try {
    const result = await API.adminLogin(email, password);
    
    if (result && result.verified && result.classification === 'admin') {
      // Store admin session
      localStorage.setItem('currentUserId', result.userId);
      localStorage.setItem('currentUserEmail', email);
      localStorage.setItem('userClassification', 'admin');
      
      // Redirect to admin portal
      window.location.href = 'admin.html';
    } else {
      showAlert('Invalid admin credentials or insufficient privileges.', 'danger');
    }
  } catch (error) {
    console.error('Admin login error:', error);
    showAlert(error.message || 'Failed to login as admin. Please check your credentials.', 'danger');
  }
}

// Logout function
function logout() {
  // Clear all localStorage data
  localStorage.removeItem('currentUserId');
  localStorage.removeItem('currentPassportCode');
  localStorage.removeItem('currentUserEmail');
  localStorage.removeItem('userStatus');
  localStorage.removeItem('userClassification');
  localStorage.removeItem('verificationId');
  
  // Redirect to login/verification page
  window.location.href = 'index.html';
}

// Check for alerts on page load
document.addEventListener('DOMContentLoaded', async function() {
  // Check user status first
  await checkUserStatus();
  
  try {
    // Check for unread alerts
    const alerts = await API.getUnreadAlerts();
    alerts.forEach(async (alert) => {
      if (alert.priority === 'high') {
        showAlert(alert.message, 'danger');
      } else if (alert.priority === 'medium') {
        showAlert(alert.message, 'warning');
      } else {
        showAlert(alert.message, 'info');
      }
      try {
        await API.markAlertRead(alert.id);
      } catch (e) {
        console.error('Failed to mark alert as read:', e);
      }
    });
  } catch (error) {
    console.error('Failed to load alerts:', error);
  }
});

