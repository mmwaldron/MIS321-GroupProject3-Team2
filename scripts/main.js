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

// Note: QR code login is now handled in qrLogin.js
// Old passport code system has been removed

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
  localStorage.removeItem('currentUserEmail');
  localStorage.removeItem('userStatus');
  localStorage.removeItem('userClassification');
  localStorage.removeItem('verificationId');
  
  // Redirect to login/verification page
  window.location.href = 'index.html';
}

// Check for alerts on page load - ONLY when user is logged in as admin
// Note: admin.html has its own alert checking in admin.js, so we skip it there to avoid duplicates
document.addEventListener('DOMContentLoaded', async function() {
  // Check user status first
  await checkUserStatus();
  
  // Skip alert checking on admin.html (admin.js handles it)
  const isAdminPage = window.location.pathname.includes('admin.html');
  if (isAdminPage) {
    return; // admin.js will handle alerts on admin.html
  }
  
  // Only check for alerts if user is logged in as admin (and not on admin.html)
  const userClassification = localStorage.getItem('userClassification');
  const isAdmin = userClassification === 'admin';
  
  if (!isAdmin) {
    // Not logged in as admin - don't show alerts
    return;
  }
  
  try {
    // Check for unread alerts (only for admins, on non-admin pages)
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

// Check if user is logged in and redirect appropriately (for index.html)
// Only redirect if user has BOTH userId AND userClassification (meaning they logged in via QR/admin)
(function checkLoginAndRedirect() {
  // Only run on index.html
  if (!window.location.pathname.includes('index.html') && window.location.pathname !== '/') {
    return;
  }
  
  const userId = localStorage.getItem('currentUserId');
  const userClassification = localStorage.getItem('userClassification');
  
  // Only redirect if user is actually logged in (has both userId and classification)
  // Users who just submitted verification won't have userClassification, so they won't be redirected
  if (userId && userClassification) {
    if (userClassification === 'admin') {
      window.location.replace('admin.html');
    } else if (userClassification === 'user') {
      window.location.replace('dashboard.html');
    }
  }
  // If userId exists but no classification, clear it (user submitted verification but didn't log in)
  else if (userId && !userClassification) {
    localStorage.removeItem('currentUserId');
  }
})();

