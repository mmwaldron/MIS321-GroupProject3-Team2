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
function lookupPassport(event) {
  event.preventDefault();
  const code = document.getElementById('passportCodeInput').value.trim();
  
  if (!code || code.length !== 10 || !/^\d{10}$/.test(code)) {
    showAlert('Please enter a valid 10-digit passport code.', 'danger');
    return;
  }

  // Find user by passport code
  const users = Database.getUsers();
  const user = users.find(u => u.passportCode === code || u.passportId === code);
  
  if (!user) {
    showAlert('Passport code not found. Please verify your code and try again.', 'danger');
    return;
  }

  if (!user.verified) {
    showAlert('This passport has not been verified yet. Please wait for admin approval.', 'warning');
    return;
  }

  // Store code and redirect
  localStorage.setItem('currentPassportCode', code);
  localStorage.setItem('currentUserId', user.id);
  window.location.href = `passport.html?code=${code}`;
}

// Check for alerts on page load
document.addEventListener('DOMContentLoaded', function() {
  // Check for unread alerts
  const alerts = Database.getUnreadAlerts();
  alerts.forEach(alert => {
    if (alert.priority === 'high') {
      showAlert(alert.message, 'danger');
    } else if (alert.priority === 'medium') {
      showAlert(alert.message, 'warning');
    } else {
      showAlert(alert.message, 'info');
    }
    Database.markAlertRead(alert.id);
  });
});

