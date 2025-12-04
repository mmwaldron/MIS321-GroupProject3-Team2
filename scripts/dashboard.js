// Dashboard - Priority Cyber-Bio Alerts
document.addEventListener('DOMContentLoaded', async function() {
  // Check authentication
  const userId = localStorage.getItem('currentUserId');
  if (!userId) {
    // Not logged in, redirect to index.html
    window.location.href = 'index.html';
    return;
  }

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
});

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
        <p class="card-text text-light fw-bold mb-3" style="font-size: 0.95rem;">${escapeHtml(shortDescription)}</p>
        <div class="row g-2 mb-3">
          <div class="col-6">
            <small class="text-light d-block fw-semibold mb-1">CVSS Score</small>
            <strong class="text-white" style="font-size: 1.1rem;">${cvssScore}</strong>
          </div>
          <div class="col-6">
            <small class="text-light d-block fw-semibold mb-1">Risk Score</small>
            <strong class="text-white" style="font-size: 1.1rem;">${riskScore}</strong>
          </div>
          <div class="col-6">
            <small class="text-light d-block fw-semibold mb-1">Trust Score</small>
            <strong class="text-success fw-bold" style="font-size: 1.1rem;">${trustScore}</strong>
          </div>
          <div class="col-6">
            <small class="text-light d-block fw-semibold mb-1">Processed</small>
            <small class="text-white fw-normal">${processedDate}</small>
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
    const passportCodeEl = document.getElementById('profilePassportCode');
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

    // Try to get passport code if user is verified
    if (user.verified && passportCodeEl && passportCodeSection) {
      try {
        const passportResponse = await API.getUserPassportCode(userId);
        if (passportResponse && passportResponse.code) {
          passportCodeEl.textContent = passportResponse.code;
          passportCodeSection.style.display = 'block';
        } else {
          passportCodeSection.style.display = 'none';
        }
      } catch (error) {
        console.error('Error fetching passport code:', error);
        passportCodeSection.style.display = 'none';
      }
    } else if (passportCodeSection) {
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

