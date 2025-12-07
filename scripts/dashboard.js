// Dashboard - Priority Cyber-Bio Alerts
document.addEventListener('DOMContentLoaded', async function() {
  // Check authentication
  const userId = localStorage.getItem('currentUserId');
  if (!userId) {
    // Not logged in, redirect to index.html
    window.location.href = 'index.html';
    return;
  }

  // Check if user is approved before showing dashboard
  try {
    const user = await API.getUser(userId);
    
    // Check if user is verified/approved
    if (!user.verified) {
      // User is pending - hide dashboard and show pending message
      showPendingApprovalMessage();
      return;
    }

    // Check verification status as well
    try {
      const verifications = await API.getVerificationsByUserId(userId);
      const latestVerification = verifications && verifications.length > 0 ? verifications[0] : null;
      
      if (latestVerification && latestVerification.status !== 'approved') {
        // Verification is not approved - show pending message
        showPendingApprovalMessage();
        return;
      }
    } catch (error) {
      console.error('Error checking verification status:', error);
      // If we can't check verification, still allow if user.verified is true
    }

    // User is approved - show dashboard
    showDashboardContent();
    
    // Load alerts on page load
    await loadAlerts();

    // Set up tab switching to load profile when profile tab is clicked
    const profileTab = document.getElementById('profile-tab');
    if (profileTab) {
      profileTab.addEventListener('shown.bs.tab', function() {
        loadProfile();
      });
    }

    // Load profile if already on profile tab (e.g., direct navigation)
    const activeTab = document.querySelector('#dashboardTabs .nav-link.active');
    if (activeTab && activeTab.id === 'profile-tab') {
      loadProfile();
    }
  } catch (error) {
    console.error('Error checking user status:', error);
    showAlert('Failed to verify your account status. Please try again.', 'danger');
    // Hide dashboard content on error
    showPendingApprovalMessage();
  }
});

function showPendingApprovalMessage() {
  // Check if user has dismissed the message
  const dismissedKey = 'pendingMessageDismissed_' + localStorage.getItem('currentUserId');
  if (localStorage.getItem(dismissedKey) === 'true') {
    // User has dismissed it, don't show again
    return;
  }

  // Hide all dashboard content
  const dashboardTabs = document.getElementById('dashboardTabs');
  const dashboardTabContent = document.getElementById('dashboardTabContent');
  
  if (dashboardTabs) dashboardTabs.style.display = 'none';
  if (dashboardTabContent) dashboardTabContent.style.display = 'none';

  // Create or show pending approval modal overlay
  let pendingModal = document.getElementById('pendingApprovalModal');
  if (!pendingModal) {
    pendingModal = document.createElement('div');
    pendingModal.id = 'pendingApprovalModal';
    pendingModal.className = 'pending-approval-overlay';
    document.body.appendChild(pendingModal);
  }

  pendingModal.innerHTML = `
    <div class="pending-approval-modal-content">
      <div class="card border-warning bg-dark shadow-lg">
        <div class="card-body p-5 text-center">
          <i class="bi bi-hourglass-split text-warning mb-3" style="font-size: 5rem; animation: pulse 2s ease-in-out infinite;"></i>
          <h2 class="text-warning mb-4 fw-bold">Account Pending Approval</h2>
          <p class="text-light mb-4" style="font-size: 1.15rem; line-height: 1.6;">
            Your account registration has been received and is pending admin approval.
            <br><br>
            You will be able to access the dashboard once an administrator has reviewed and approved your account.
          </p>
          <div class="d-flex justify-content-center gap-3 mt-4">
            <button class="btn btn-warning btn-lg px-4" onclick="checkDashboardStatus()">
              <i class="bi bi-arrow-clockwise"></i> Check Status
            </button>
            <button class="btn btn-outline-light btn-lg px-4" onclick="dismissPendingMessage()">
              <i class="bi bi-house"></i> Return Home
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  pendingModal.style.display = 'flex';
}

// Function to dismiss the pending message and navigate home
function dismissPendingMessage() {
  const userId = localStorage.getItem('currentUserId');
  if (userId) {
    // Mark message as dismissed for this user
    const dismissedKey = 'pendingMessageDismissed_' + userId;
    localStorage.setItem(dismissedKey, 'true');
  }
  
  // Hide the modal
  const pendingModal = document.getElementById('pendingApprovalModal');
  if (pendingModal) {
    pendingModal.style.display = 'none';
  }
  
  // Navigate to home
  window.location.href = 'index.html';
}

// Make dismissPendingMessage available globally
window.dismissPendingMessage = dismissPendingMessage;

// Function to check account status and refresh dashboard
async function checkDashboardStatus() {
  const userId = localStorage.getItem('currentUserId');
  if (!userId) {
    showAlert('No user session found. Please register again.', 'warning');
    window.location.href = 'index.html';
    return;
  }

  try {
    showAlert('Checking account status...', 'info');
    const user = await API.getUser(userId);
    
    if (user.verified) {
      // Check verification status
      try {
        const verifications = await API.getVerificationsByUserId(userId);
        const latestVerification = verifications && verifications.length > 0 ? verifications[0] : null;
        
        if (latestVerification && latestVerification.status === 'approved') {
          // User is approved - refresh the page to show dashboard
          showAlert('Your account has been approved! Loading dashboard...', 'success');
          localStorage.setItem('userStatus', 'approved');
          setTimeout(() => {
            window.location.reload();
          }, 1500);
          return;
        }
      } catch (error) {
        console.error('Error checking verification:', error);
      }
    }
    
    // Still pending
    showAlert('Your account is still pending approval. Please check back later.', 'info');
  } catch (error) {
    console.error('Error checking account status:', error);
    showAlert('Failed to check account status. Please try again.', 'danger');
  }
}

// Make checkDashboardStatus available globally
window.checkDashboardStatus = checkDashboardStatus;

function showDashboardContent() {
  // Clear the dismissed flag when user is approved
  const userId = localStorage.getItem('currentUserId');
  if (userId) {
    const dismissedKey = 'pendingMessageDismissed_' + userId;
    localStorage.removeItem(dismissedKey);
  }
  
  // Hide pending approval modal
  const pendingModal = document.getElementById('pendingApprovalModal');
  if (pendingModal) {
    pendingModal.style.display = 'none';
  }
  
  // Show dashboard content
  const dashboardTabs = document.getElementById('dashboardTabs');
  const dashboardTabContent = document.getElementById('dashboardTabContent');
  
  if (dashboardTabs) dashboardTabs.style.display = 'block';
  if (dashboardTabContent) dashboardTabContent.style.display = 'block';
}

async function loadAlerts() {
  const loadingState = document.getElementById('loadingState');
  const errorState = document.getElementById('errorState');
  const errorMessage = document.getElementById('errorMessage');
  const emptyState = document.getElementById('emptyState');
  const alertsContainer = document.getElementById('alertsContainer');

  try {
    // Show loading state
    loadingState.style.display = 'block';
    errorState.style.display = 'none';
    emptyState.style.display = 'none';
    alertsContainer.style.display = 'none';

    // Fetch alerts from API
    const alerts = await API.getTopAlerts();

    // Hide loading state
    loadingState.style.display = 'none';

    if (!alerts || alerts.length === 0) {
      emptyState.style.display = 'block';
      return;
    }

    // Render alerts
    renderAlerts(alerts);
    alertsContainer.style.display = 'flex';
  } catch (error) {
    console.error('Error loading alerts:', error);
    loadingState.style.display = 'none';
    errorState.style.display = 'block';
    
    let message = error.message || 'Failed to load alerts. Please try again later.';
    
    // Provide helpful message for file:// protocol
    if (window.location.protocol === 'file:') {
      message = 'This page must be accessed through the web server. Please start the backend server (dotnet run) and access this page at http://localhost:5143/dashboard.html';
    } else if (message.includes('Cannot connect to the API server')) {
      message = 'Cannot connect to the API server. Please ensure the backend server is running.';
    } else if (message.includes('max_questions') || message.includes('exceeded')) {
      message = 'Database query limit exceeded. Please wait a few minutes and try again. The limit resets hourly.';
    }
    
    errorMessage.textContent = message;
  }
}

function renderAlerts(alerts) {
  const alertsContainer = document.getElementById('alertsContainer');
  if (!alertsContainer) return;

  alertsContainer.innerHTML = '';

  alerts.forEach((alert, index) => {
    const alertCard = createAlertCard(alert, index);
    alertsContainer.appendChild(alertCard);
  });
}

function createAlertCard(alert, index) {
  // Create card column
  const col = document.createElement('div');
  col.className = 'col-md-6 col-lg-4';

  // Determine tier badge color and header background
  let badgeClass = 'bg-secondary';
  let badgeText = 'Unknown';
  let headerBgClass = 'bg-dark';
  let headerTextClass = 'text-light';
  
  if (alert.tier === 'red') {
    badgeClass = 'bg-danger';
    badgeText = 'High Priority';
    headerBgClass = 'bg-danger'; // Strong red background
    headerTextClass = 'text-white';
  } else if (alert.tier === 'yellow') {
    badgeClass = 'bg-warning';
    badgeText = 'Medium Priority';
    headerBgClass = 'bg-warning'; // Strong yellow background
    headerTextClass = 'text-dark';
  } else if (alert.tier === 'green') {
    badgeClass = 'bg-success';
    badgeText = 'Low Priority';
    headerBgClass = 'bg-success'; // Strong green background
    headerTextClass = 'text-white';
  }

  // Create unique ID for collapse
  const collapseId = `alertCollapse${index}`;
  const headingId = `alertHeading${index}`;

  // Format scores
  const cvssScore = alert.cvss_score !== null && alert.cvss_score !== undefined 
    ? alert.cvss_score.toFixed(1) 
    : 'N/A';
  const riskScore = alert.risk_score !== null && alert.risk_score !== undefined 
    ? alert.risk_score.toFixed(1) 
    : 'N/A';
  const trustScore = alert.trust_score !== null && alert.trust_score !== undefined 
    ? alert.trust_score.toFixed(1) 
    : 'N/A';

  // Format description (truncate if too long)
  const description = alert.description || 'No description available';
  const shortDescription = description.length > 150 
    ? description.substring(0, 150) + '...' 
    : description;

  // Format processed date
  let processedDate = 'N/A';
  if (alert.processed_at) {
    try {
      const date = new Date(alert.processed_at);
      processedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch (e) {
      processedDate = alert.processed_at;
    }
  }

  col.innerHTML = `
    <div class="card h-100 border-${alert.tier === 'red' ? 'danger' : alert.tier === 'yellow' ? 'warning' : 'success'}">
      <div class="card-header ${headerBgClass} d-flex justify-content-between align-items-center border-bottom border-${alert.tier === 'red' ? 'danger' : alert.tier === 'yellow' ? 'warning' : 'success'} border-2" style="${alert.tier === 'red' ? 'background-color: #dc3545 !important;' : alert.tier === 'yellow' ? 'background-color: #ffc107 !important;' : 'background-color: #28a745 !important;'}">
        <div>
          <span class="badge ${badgeClass === 'bg-danger' ? 'bg-dark' : badgeClass === 'bg-warning' ? 'bg-dark' : 'bg-dark'} me-2">${badgeText}</span>
          <strong class="${headerTextClass}">${alert.cve_id || 'Unknown CVE'}</strong>
        </div>
        <button
          class="btn btn-sm btn-outline-${alert.tier === 'red' ? 'light' : alert.tier === 'yellow' ? 'dark' : 'light'}"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#${collapseId}"
          aria-expanded="false"
          aria-controls="${collapseId}"
        >
          <i class="bi bi-chevron-down"></i>
        </button>
      </div>
      <div class="card-body bg-dark">
        <p class="card-text text-light fw-bold mb-3" style="font-size: 0.95rem; line-height: 1.5;">${escapeHtml(shortDescription)}</p>
        <div class="row g-2 mb-3">
          <div class="col-6">
            <small class="text-light d-block fw-semibold mb-1" style="font-size: 0.85rem;">CVSS Score</small>
            <strong class="text-white" style="font-size: 1.15rem; font-weight: 700;">${cvssScore}</strong>
          </div>
          <div class="col-6">
            <small class="text-light d-block fw-semibold mb-1" style="font-size: 0.85rem;">Risk Score</small>
            <strong class="text-white" style="font-size: 1.15rem; font-weight: 700;">${riskScore}</strong>
          </div>
          <div class="col-6">
            <small class="text-light d-block fw-semibold mb-1" style="font-size: 0.85rem;">Trust Score</small>
            <strong class="text-success fw-bold" style="font-size: 1.15rem; font-weight: 700;">${trustScore}</strong>
          </div>
          <div class="col-6">
            <small class="text-light d-block fw-semibold mb-1" style="font-size: 0.85rem;">Processed</small>
            <small class="text-white fw-normal" style="font-size: 0.9rem;">${processedDate}</small>
          </div>
        </div>
      </div>
      <div class="collapse" id="${collapseId}">
        <div class="card-body border-top bg-dark">
          <h6 class="text-success mb-3">Full Description</h6>
          <p class="text-light small">${escapeHtml(description)}</p>
          <h6 class="text-success mb-3 mt-3">Safe Guidance</h6>
          <div class="alert alert-info mb-0">
            <i class="bi bi-info-circle"></i>
            <strong>Recommended Actions:</strong>
            <ul class="mb-0 mt-2">
              <li>Review the CVE details and assess impact on your systems</li>
              <li>Check for available patches or mitigations</li>
              <li>Monitor affected systems for any suspicious activity</li>
              <li>Update security policies if necessary</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  `;

  return col;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load user profile data
async function loadProfile() {
  const userId = localStorage.getItem('currentUserId');
  if (!userId) {
    console.error('No user ID found');
    return;
  }

  const loadingState = document.getElementById('profileLoadingState');
  const errorState = document.getElementById('profileErrorState');
  const errorMessage = document.getElementById('profileErrorMessage');
  const profileContent = document.getElementById('profileContent');

  try {
    // Show loading state
    if (loadingState) loadingState.style.display = 'block';
    if (errorState) errorState.style.display = 'none';
    if (profileContent) profileContent.style.display = 'none';

    // Fetch user data
    const user = await API.getUser(userId);

    // Hide loading state
    if (loadingState) loadingState.style.display = 'none';

    // Populate profile fields
    const emailEl = document.getElementById('profileEmail');
    const userIdEl = document.getElementById('profileUserId');
    const statusEl = document.getElementById('profileStatus');
    const createdAtEl = document.getElementById('profileCreatedAt');
    // Passport code section removed - using QR login instead
    const passportCodeSection = document.getElementById('passportCodeSection');

    if (emailEl) emailEl.textContent = user.email || '-';
    if (userIdEl) userIdEl.textContent = user.id || '-';
    
    if (statusEl) {
      if (user.verified) {
        statusEl.textContent = 'Approved';
        statusEl.className = 'badge bg-success';
      } else {
        statusEl.textContent = 'Pending Approval';
        statusEl.className = 'badge bg-warning';
      }
    }

    if (createdAtEl && user.createdAt) {
      const date = new Date(user.createdAt);
      createdAtEl.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }

    // Hide passport code section (replaced with QR login)
    if (passportCodeSection) {
      passportCodeSection.style.display = 'none';
    }

    // Show profile content
    if (profileContent) profileContent.style.display = 'block';
  } catch (error) {
    console.error('Error loading profile:', error);
    if (loadingState) loadingState.style.display = 'none';
    if (errorState) {
      errorState.style.display = 'block';
      if (errorMessage) {
        errorMessage.textContent = error.message || 'Failed to load profile. Please try again later.';
      }
    }
  }
}

async function triggerIngestion() {
  const ingestBtn = document.getElementById('ingestBtn');
  if (!ingestBtn) return;

  const originalText = ingestBtn.innerHTML;
  ingestBtn.disabled = true;
  ingestBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Ingesting...';

  try {
    const result = await API.triggerNvdIngest();
    if (result.status === 'ok') {
      showAlert(`Successfully ingested ${result.ingested || 0} CVEs. Refreshing alerts...`, 'success');
      // Reload alerts after a short delay
      setTimeout(() => {
        loadAlerts();
      }, 1000);
    } else {
      showAlert('Ingestion completed but may have encountered issues.', 'warning');
    }
  } catch (error) {
    console.error('Error triggering ingestion:', error);
    showAlert('Failed to trigger NVD ingestion: ' + (error.message || 'Unknown error'), 'danger');
  } finally {
    ingestBtn.disabled = false;
    ingestBtn.innerHTML = originalText;
  }
}

// Make functions available globally
window.loadAlerts = loadAlerts;
window.triggerIngestion = triggerIngestion;

