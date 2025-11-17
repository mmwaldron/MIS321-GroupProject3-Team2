// Admin Dashboard Logic
let currentCaseId = null;
let allVerifications = [];

function loadDashboard() {
  allVerifications = Database.getVerifications();
  updateStats();
  displayCases();
  loadMessages();
  checkAlerts();
}

function updateStats() {
  const pending = allVerifications.filter(v => v.status === 'pending').length;
  const highRisk = allVerifications.filter(v => v.riskLevel === 'high').length;
  const approved = allVerifications.filter(v => v.status === 'approved').length;
  const total = Database.getUsers().length;

  document.getElementById('statPending').textContent = pending;
  document.getElementById('statHighRisk').textContent = highRisk;
  document.getElementById('statApproved').textContent = approved;
  document.getElementById('statTotal').textContent = total;
}

function displayCases() {
  const tbody = document.getElementById('casesTableBody');
  if (!tbody) return;

  // Rank verifications
  const ranked = RiskFilter.rankVerifications(allVerifications);

  if (ranked.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No cases found</td></tr>';
    return;
  }

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

function viewCase(caseId) {
  currentCaseId = caseId;
  const verification = Database.getVerification(caseId);
  if (!verification) return;

  const user = Database.getUser(verification.userId);
  const modalBody = document.getElementById('caseModalBody');
  const approveBtn = document.getElementById('approveBtn');
  const denyBtn = document.getElementById('denyBtn');

  modalBody.innerHTML = `
    <div class="row">
      <div class="col-md-6 mb-3">
        <h6 class="text-success">User Information</h6>
        <p><strong>Name:</strong> ${user?.name || 'N/A'}</p>
        <p><strong>Email:</strong> ${user?.email || 'N/A'}</p>
        <p><strong>Phone:</strong> ${user?.phone || 'N/A'}</p>
        <p><strong>Organization:</strong> ${user?.organization || 'N/A'}</p>
      </div>
      <div class="col-md-6 mb-3">
        <h6 class="text-success">Verification Details</h6>
        <p><strong>Status:</strong> ${getStatusBadge(verification.status)}</p>
        <p><strong>Risk Level:</strong> ${getRiskBadge(verification.riskLevel)}</p>
        <p><strong>Risk Score:</strong> ${verification.riskScore}</p>
        <p><strong>Urgency:</strong> ${verification.urgency}</p>
        <p><strong>Credibility:</strong> ${verification.credibility}</p>
        <p><strong>Trust Score:</strong> ${verification.trustScore || 0}</p>
        <p><strong>Passport Code:</strong> <span style="font-family: 'Courier New', monospace; color: var(--primary-green); font-weight: bold; font-size: 1.1rem;">${user?.passportCode || user?.passportId || 'Not issued'}</span></p>
      </div>
      <div class="col-12 mb-3">
        <h6 class="text-success">Risk Factors</h6>
        <pre class="bg-dark p-3 border border-success rounded">${JSON.stringify(verification.factors || {}, null, 2)}</pre>
      </div>
      <div class="col-12">
        <h6 class="text-success">Admin Notes</h6>
        <textarea class="form-control bg-dark text-light border-success" id="adminNotes" rows="3">${verification.adminNotes || ''}</textarea>
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
}

function approveCase() {
  if (!currentCaseId) return;

  const verification = Database.getVerification(currentCaseId);
  if (!verification) return;

  const adminNotes = document.getElementById('adminNotes')?.value || '';

  // Update verification
  Database.updateVerification(currentCaseId, {
    status: 'approved',
    adminNotes,
    reviewedAt: new Date().toISOString(),
    reviewedBy: 'admin'
  });

  // Generate 10-digit passport code
  const passportCode = generatePassportCode();
  
  // Update user
  const user = Database.getUser(verification.userId);
  Database.updateUser(verification.userId, {
    verified: true,
    verifiedAt: new Date().toISOString(),
    passportId: passportCode,
    passportCode: passportCode,
    trustScore: verification.trustScore
  });

  // Increase trust score for approval
  TrustScore.updateScore(verification.userId, 'admin_approval', 10);

  // Create alert
  Database.createAlert({
    type: 'verification_approved',
    title: 'Verification Approved',
    message: `Verification for ${user.name} has been approved. Passport Code: ${passportCode}`,
    userId: verification.userId,
    verificationId: currentCaseId,
    priority: 'low'
  });
  
  // Show passport code to admin
  alert(`Verification approved!\n\nPassport Code: ${passportCode}\n\nShare this code with the user to access their passport.`);

  // Refresh dashboard
  allVerifications = Database.getVerifications();
  updateStats();
  displayCases();

  // Close modal
  const modal = bootstrap.Modal.getInstance(document.getElementById('caseModal'));
  modal.hide();

  showAlert('Verification approved successfully.', 'success');
}

function denyCase() {
  if (!currentCaseId) return;

  const verification = Database.getVerification(currentCaseId);
  if (!verification) return;

  const adminNotes = document.getElementById('adminNotes')?.value || '';

  // Update verification
  Database.updateVerification(currentCaseId, {
    status: 'denied',
    adminNotes,
    reviewedAt: new Date().toISOString(),
    reviewedBy: 'admin'
  });

  // Decrease trust score for denial
  TrustScore.updateScore(verification.userId, 'admin_denial', -20);

  // Create alert
  const user = Database.getUser(verification.userId);
  Database.createAlert({
    type: 'verification_denied',
    title: 'Verification Denied',
    message: `Verification for ${user.name} has been denied.`,
    userId: verification.userId,
    verificationId: currentCaseId,
    priority: 'medium'
  });

  // Refresh dashboard
  allVerifications = Database.getVerifications();
  updateStats();
  displayCases();

  // Close modal
  const modal = bootstrap.Modal.getInstance(document.getElementById('caseModal'));
  modal.hide();

  showAlert('Verification denied.', 'danger');
}

function applyFilters() {
  const statusFilter = document.getElementById('filterStatus').value;
  const riskFilter = document.getElementById('filterRisk').value;
  const sortBy = document.getElementById('sortBy').value;

  let filtered = [...allVerifications];

  // Filter by status
  if (statusFilter !== 'all') {
    filtered = filtered.filter(v => v.status === statusFilter);
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

function loadMessages() {
  const messagesList = document.getElementById('messagesList');
  if (!messagesList) return;

  const messages = Database.getUnreadMessages();
  document.getElementById('messageCount').textContent = messages.length;

  if (messages.length === 0) {
    messagesList.innerHTML = '<p class="text-muted text-center">No new messages</p>';
    return;
  }

  messagesList.innerHTML = messages.map(m => {
    const user = Database.getUser(m.userId);
    return `
      <div class="message-item border-bottom border-success pb-3 mb-3">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <h6 class="mb-1">${m.subject}</h6>
            <p class="text-muted mb-1">From: ${user?.name || 'Unknown'} (${user?.email || ''})</p>
            <p class="mb-0">${m.message}</p>
          </div>
          <button class="btn btn-sm btn-outline-success" onclick="markMessageRead('${m.id}')">
            <i class="bi bi-check"></i>
          </button>
        </div>
        <small class="text-muted">${new Date(m.createdAt).toLocaleString()}</small>
      </div>
    `;
  }).join('');
}

function markMessageRead(messageId) {
  Database.markMessageRead(messageId);
  loadMessages();
}

function checkAlerts() {
  const alerts = Database.getUnreadAlerts();
  alerts.forEach(alert => {
    if (alert.priority === 'high') {
      showAlert(alert.message, 'danger');
    } else {
      showAlert(alert.message, 'info');
    }
  });
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
    setInterval(() => {
      allVerifications = Database.getVerifications();
      updateStats();
      displayCases();
      loadMessages();
    }, 30000);
  }
});

