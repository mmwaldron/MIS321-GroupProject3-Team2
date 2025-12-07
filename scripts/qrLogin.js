// QR Login functionality

function showAlert(message, type = 'info') {
  const alertContainer = document.getElementById('alertContainer');
  if (!alertContainer) return;

  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
  alertDiv.innerHTML = `
    ${message}
    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="alert"></button>
  `;
  alertContainer.appendChild(alertDiv);

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    if (alertDiv.parentNode) {
      alertDiv.remove();
    }
  }, 5000);
}

async function handleQrLogin(event) {
  event.preventDefault();

  const qrFileInput = document.getElementById('qrFileInput');
  const qrTextInput = document.getElementById('qrTextInput');
  const loginBtn = document.getElementById('loginBtn');
  const originalBtnText = loginBtn.innerHTML;

  // Clear previous alerts
  const alertContainer = document.getElementById('alertContainer');
  if (alertContainer) {
    alertContainer.innerHTML = '';
  }

  const qrFile = qrFileInput?.files[0];
  const qrText = qrTextInput?.value?.trim();

  if (!qrFile && !qrText) {
    showAlert('Please upload a QR code image or enter QR code text.', 'danger');
    return;
  }

  try {
    // Disable button
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Logging in...';

    // Prepare form data
    const formData = new FormData();
    if (qrFile) {
      formData.append('qrFile', qrFile);
    }
    if (qrText) {
      formData.append('qrText', qrText);
    }

    // Get API URL
    const apiUrl = API_CONFIG.getUrl('/qr-login');

    // Send request
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }

    // Login successful
    if (data.verified && data.userId) {
      // Store user info
      localStorage.setItem('currentUserId', data.userId);
      localStorage.setItem('userClassification', data.classification || 'user');
      
      // Remove old passport code if exists
      localStorage.removeItem('currentPassportCode');

      showAlert('Login successful! Redirecting...', 'success');

      // QR login always redirects to dashboard (admins should use admin login)
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1000);
    } else {
      throw new Error('Invalid response from server');
    }
  } catch (error) {
    console.error('QR login error:', error);
    showAlert(error.message || 'Failed to login with QR code. Please check your QR code and try again.', 'danger');
    
    // Re-enable button
    loginBtn.disabled = false;
    loginBtn.innerHTML = originalBtnText;
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  // Check if user is already logged in
  const userId = localStorage.getItem('currentUserId');
  if (userId) {
    // QR login always redirects to dashboard (admins should use admin login)
    window.location.href = 'dashboard.html';
  }
});

