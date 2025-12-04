// Admin Dashboard Logic
let currentCaseId = null;
let allVerifications = [];

async function loadDashboard() {
  try {
    allVerifications = await API.getVerifications();
    await updateStats();
    await displayCases();
    await loadMessages();
    await checkAlerts();
  } catch (error) {
    console.error('Failed to load dashboard:', error);
    showAlert('Failed to load dashboard data.', 'danger');
  }
}

async function updateStats() {
  const pending = allVerifications.filter(v => v.status === 'pending').length;
  const highRisk = allVerifications.filter(v => v.riskLevel === 'high').length;
  const approved = allVerifications.filter(v => v.status === 'approved').length;
  
  // Get total users count - we'll need to add this endpoint or calculate from verifications
  const total = allVerifications.length; // Approximate for now

  document.getElementById('statPending').textContent = pending;
  document.getElementById('statHighRisk').textContent = highRisk;
  document.getElementById('statApproved').textContent = approved;
  document.getElementById('statTotal').textContent = total;
}

async function displayCases() {
  const tbody = document.getElementById('casesTableBody');
  if (!tbody) return;

  // Filter to only show pending users
  const pendingVerifications = allVerifications.filter(v => v.status === 'pending');

  // Rank verifications
  const ranked = RiskFilter.rankVerifications(pendingVerifications);

  if (ranked.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No pending cases found</td></tr>';
    return;
  }

  // Fetch users for display
  const userMap = new Map();
  for (const v of ranked) {
    if (!userMap.has(v.userId)) {
      try {
        const user = await API.getUser(v.userId);
        userMap.set(v.userId, user);
      } catch (error) {
        console.error(`Failed to fetch user ${v.userId}:`, error);
      }
    }
  }

  tbody.innerHTML = ranked.map(v => {
    const user = userMap.get(v.userId);
    const statusBadge = getStatusBadge(v.status);
    const riskBadge = getRiskBadge(v.riskLevel);
    const urgencyBadge = getUrgencyBadge(v.urgency);
    const credibilityBadge = getCredibilityBadge(v.credibility);
    // Passport code would need to be retrieved separately or stored in verification
    const passportDisplay = '<span class="text-muted">Check details</span>';

    return `
      <tr class="case-row" data-case-id="${v.id}" onclick="viewCase('${v.id}')">
        <td>
          <div class="fw-bold">${v.name || 'Unknown'}</div>
          <small class="text-muted">${v.email || ''}</small>
        </td>
        <td>${statusBadge}</td>
        <td>${riskBadge}</td>
        <td>${urgencyBadge}</td>
        <td>${credibilityBadge}</td>
        <td><span class="trust-score-badge">${v.trustScore || 0}</span></td>
        <td>${passportDisplay}</td>
        <td><small>${new Date(v.createdAt).toLocaleDateString()}</small></td>
        <td>
          <button class="btn btn-sm btn-outline-success" onclick="event.stopPropagation(); viewCase('${v.id}')">
            <i class="bi bi-eye"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function getStatusBadge(status) {
  const badges = {
    pending: '<span class="badge bg-warning">Pending</span>',
    approved: '<span class="badge bg-success">Approved</span>',
    denied: '<span class="badge bg-danger">Denied</span>'
  };
  return badges[status] || badges.pending;
}

function getRiskBadge(level) {
  const badges = {
    high: '<span class="badge bg-danger">High</span>',
    medium: '<span class="badge bg-warning">Medium</span>',
    low: '<span class="badge bg-success">Low</span>'
  };
  return badges[level] || badges.low;
}

function getUrgencyBadge(urgency) {
  if (urgency >= 70) return '<span class="badge bg-danger">Critical</span>';
  if (urgency >= 40) return '<span class="badge bg-warning">High</span>';
  return '<span class="badge bg-info">Normal</span>';
}

function getCredibilityBadge(credibility) {
  if (credibility >= 70) return '<span class="badge bg-success">High</span>';
  if (credibility >= 40) return '<span class="badge bg-warning">Medium</span>';
  return '<span class="badge bg-danger">Low</span>';
}

async function viewCase(caseId) {
  currentCaseId = caseId;
  try {
    const verification = await API.getVerification(caseId);
    if (!verification) return;

    const user = await API.getUser(verification.userId);
    const modalBody = document.getElementById('caseModalBody');
    const approveBtn = document.getElementById('approveBtn');
    const denyBtn = document.getElementById('denyBtn');

    modalBody.innerHTML = `
      <div class="row">
        <div class="col-md-6 mb-3">
          <h6 class="text-success">User Information</h6>
          <p><strong>Name:</strong> ${verification.name || 'N/A'}</p>
          <p><strong>Email:</strong> ${verification.email || user?.email || 'N/A'}</p>
          <p><strong>Phone:</strong> ${verification.phone || 'N/A'}</p>
          <p><strong>Organization:</strong> ${verification.organization || 'N/A'}</p>
        </div>
        <div class="col-md-6 mb-3">
          <h6 class="text-success">Verification Details</h6>
          <p><strong>Status:</strong> ${getStatusBadge(verification.status)}</p>
          <p><strong>Risk Level:</strong> ${getRiskBadge(verification.riskLevel)}</p>
          <p><strong>Risk Score:</strong> ${verification.riskScore}</p>
          <p><strong>Urgency:</strong> ${verification.urgency}</p>
          <p><strong>Credibility:</strong> ${verification.credibility}</p>
          <p><strong>Trust Score:</strong> ${verification.trustScore || 0}</p>
          <p><strong>Passport Code:</strong> <span style="font-family: 'Courier New', monospace; color: var(--primary-green); font-weight: bold; font-size: 1.1rem;" id="passportCodeDisplay">Not issued</span></p>
        </div>
        <div class="col-12 mb-3">
          <h6 class="text-success">Risk Factors</h6>
          <pre class="bg-dark p-3 border border-success rounded">${JSON.stringify(verification.factors || {}, null, 2)}</pre>
        </div>
        <div class="col-12">
          <h6 class="text-success">Admin Notes</h6>
          <textarea class="form-control bg-dark text-light border-success" id="adminNotes" rows="3"></textarea>
        </div>
      </div>
    `;

    // Show/hide action buttons based on status
    if (verification.status === 'pending') {
      approveBtn.style.display = 'inline-block';
      denyBtn.style.display = 'inline-block';
    } else {
      approveBtn.style.display = 'none';
      denyBtn.style.display = 'none';
    }

    const modal = new bootstrap.Modal(document.getElementById('caseModal'));
    modal.show();
  } catch (error) {
    console.error('Failed to load case:', error);
    showAlert('Failed to load case details.', 'danger');
  }
}

async function approveCase() {
  if (!currentCaseId) return;

  try {
    const adminNotes = document.getElementById('adminNotes')?.value || '';

    // Approve verification via API
    const result = await API.approveVerification(currentCaseId, adminNotes);
    
    // Show passport code to admin
    if (result.passportCode) {
      document.getElementById('passportCodeDisplay').textContent = result.passportCode;
      alert(`Verification approved!\n\nPassport Code: ${result.passportCode}\n\nShare this code with the user to access their passport.`);
    }

    // Refresh dashboard
    allVerifications = await API.getVerifications();
    await updateStats();
    await displayCases();

    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('caseModal'));
    modal.hide();

    showAlert('Verification approved successfully.', 'success');
  } catch (error) {
    console.error('Failed to approve case:', error);
    showAlert('Failed to approve verification. Please try again.', 'danger');
  }
}

async function denyCase() {
  if (!currentCaseId) return;

  try {
    const adminNotes = document.getElementById('adminNotes')?.value || '';

    // Deny verification via API
    await API.denyVerification(currentCaseId, adminNotes);

    // Refresh dashboard
    allVerifications = await API.getVerifications();
    await updateStats();
    await displayCases();

    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('caseModal'));
    modal.hide();

    showAlert('Verification denied.', 'danger');
  } catch (error) {
    console.error('Failed to deny case:', error);
    showAlert('Failed to deny verification. Please try again.', 'danger');
  }
}

function applyFilters() {
  const statusFilter = document.getElementById('filterStatus').value;
  const riskFilter = document.getElementById('filterRisk').value;
  const sortBy = document.getElementById('sortBy').value;

  // Start with only pending users by default
  let filtered = allVerifications.filter(v => v.status === 'pending');

  // If user explicitly selects a different status, show that instead
  if (statusFilter !== 'all' && statusFilter !== 'pending') {
    filtered = allVerifications.filter(v => v.status === statusFilter);
  }

  // Filter by risk
  if (riskFilter !== 'all') {
    filtered = filtered.filter(v => v.riskLevel === riskFilter);
  }

  // Sort
  if (sortBy === 'urgency') {
    filtered.sort((a, b) => (b.urgency || 0) - (a.urgency || 0));
  } else if (sortBy === 'credibility') {
    filtered.sort((a, b) => (b.credibility || 0) - (a.credibility || 0));
  } else if (sortBy === 'date') {
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (sortBy === 'name') {
    filtered.sort((a, b) => {
      const userA = Database.getUser(a.userId);
      const userB = Database.getUser(b.userId);
      return (userA?.name || '').localeCompare(userB?.name || '');
    });
  }

  // Display filtered results
  const tbody = document.getElementById('casesTableBody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No cases match filters</td></tr>';
    return;
  }

  const ranked = RiskFilter.rankVerifications(filtered);
  tbody.innerHTML = ranked.map(v => {
    const user = Database.getUser(v.userId);
    const statusBadge = getStatusBadge(v.status);
    const riskBadge = getRiskBadge(v.riskLevel);
    const urgencyBadge = getUrgencyBadge(v.urgency);
    const credibilityBadge = getCredibilityBadge(v.credibility);
    const passportCode = user?.passportCode || user?.passportId || '-';
    const passportDisplay = passportCode !== '-' 
      ? `<span class="passport-code-display" style="font-family: 'Courier New', monospace; color: var(--primary-green); font-weight: bold;">${passportCode}</span>`
      : '<span class="text-muted">Not issued</span>';

    return `
      <tr class="case-row" data-case-id="${v.id}" onclick="viewCase('${v.id}')">
        <td>
          <div class="fw-bold">${user?.name || 'Unknown'}</div>
          <small class="text-muted">${user?.email || ''}</small>
        </td>
        <td>${statusBadge}</td>
        <td>${riskBadge}</td>
        <td>${urgencyBadge}</td>
        <td>${credibilityBadge}</td>
        <td><span class="trust-score-badge">${v.trustScore || 0}</span></td>
        <td>${passportDisplay}</td>
        <td><small>${new Date(v.createdAt).toLocaleDateString()}</small></td>
        <td>
          <button class="btn btn-sm btn-outline-success" onclick="event.stopPropagation(); viewCase('${v.id}')">
            <i class="bi bi-eye"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function loadMessages() {
  const messagesList = document.getElementById('messagesList');
  if (!messagesList) return;

  try {
    const messages = await API.getUnreadMessages();
    document.getElementById('messageCount').textContent = messages.length;

    if (messages.length === 0) {
      messagesList.innerHTML = '<p class="text-muted text-center">No new messages</p>';
      return;
    }

    // Fetch user info for each message
    const messageHtml = await Promise.all(messages.map(async (m) => {
      let userName = 'Unknown';
      let userEmail = '';
      try {
        const user = await API.getUser(m.userId);
        userName = user?.email || 'Unknown';
        userEmail = user?.email || '';
      } catch (error) {
        console.error(`Failed to fetch user ${m.userId}:`, error);
      }

      return `
        <div class="message-item border-bottom border-success pb-3 mb-3">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h6 class="mb-1">${m.subject || 'No subject'}</h6>
              <p class="text-muted mb-1">From: ${userName} (${userEmail})</p>
              <p class="mb-0">${m.message || ''}</p>
            </div>
            <button class="btn btn-sm btn-outline-success" onclick="markMessageRead('${m.id}')">
              <i class="bi bi-check"></i>
            </button>
          </div>
          <small class="text-muted">${new Date(m.createdAt).toLocaleString()}</small>
        </div>
      `;
    }));

    messagesList.innerHTML = messageHtml.join('');
  } catch (error) {
    console.error('Failed to load messages:', error);
    messagesList.innerHTML = '<p class="text-danger text-center">Failed to load messages</p>';
  }
}

async function markMessageRead(messageId) {
  try {
    await API.markMessageRead(messageId);
    await loadMessages();
  } catch (error) {
    console.error('Failed to mark message as read:', error);
    showAlert('Failed to mark message as read.', 'danger');
  }
}

async function checkAlerts() {
  try {
    const alerts = await API.getUnreadAlerts();
    alerts.forEach(alert => {
      if (alert.priority === 'high') {
        showAlert(alert.message, 'danger');
      } else {
        showAlert(alert.message, 'info');
      }
    });
  } catch (error) {
    console.error('Failed to check alerts:', error);
  }
}

// Generate 10-digit passport code
function generatePassportCode() {
  // Generate random 10-digit code
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
  if (window.location.pathname.includes('admin.html')) {
    loadDashboard();
    
    // Auto-refresh every 30 seconds
    setInterval(async () => {
      try {
        allVerifications = await API.getVerifications();
        await updateStats();
        await displayCases();
        await loadMessages();
      } catch (error) {
        console.error('Failed to refresh dashboard:', error);
      }
    }, 30000);
  }
});

