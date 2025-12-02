// Main Application Logic
function showAlert(message, type = 'info') {
  const alertContainer = document.getElementById('alertContainer');
  if (!alertContainer) return;

  const alertId = 'alert-' + Date.now();
  const alert = document.createElement('div');
  alert.id = alertId;
  alert.className = `alert alert-${type} alert-dismissible fade show alert-notification`;
  alert.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;

  alertContainer.appendChild(alert);

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
    if (bsAlert) bsAlert.close();
  }, 5000);
}

// Format passport code input (numbers only)
function formatPassportCode(input) {
  // Remove any non-numeric characters
  input.value = input.value.replace(/\D/g, '').slice(0, 10);
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

    // Store code and redirect to dashboard
    localStorage.setItem('currentPassportCode', code);
    localStorage.setItem('currentUserId', passport.userId);
    window.location.href = 'dashboard.html';
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
      // User is approved - show approved status and try to get passport code
      statusBanner.style.display = 'block';
      pendingCard.style.display = 'none';
      approvedCard.style.display = 'block';
      
      // Try to get passport code
      try {
        const response = await API.getUserPassportCode(userId);
        if (response && response.code) {
          const passportCode = response.code;
          // Display passport code in the approved card
          const passportCodeDisplay = document.getElementById('passportCodeDisplay');
          if (passportCodeDisplay) {
            passportCodeDisplay.textContent = passportCode;
            passportCodeDisplay.style.display = 'inline-block';
          }
          
          // Also update the passport code input if it exists
          const passportCodeInput = document.getElementById('passportCodeInput');
          if (passportCodeInput) {
            passportCodeInput.value = passportCode;
          }
        }
      } catch (error) {
        console.error('Error getting passport code:', error);
      }
      
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

