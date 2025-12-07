// Admin Dashboard Logic
let currentCaseId = null;
let allVerifications = [];

async function loadDashboard() {
  try {
    allVerifications = await API.getVerifications();
    console.log('Loaded verifications:', allVerifications.length, allVerifications);
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
  console.log('Pending verifications:', pendingVerifications.length, pendingVerifications);

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
      <tr class="case-row" data-case-id="${v.id}">
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
        <td><small>${v.createdAt ? new Date(v.createdAt).toLocaleDateString() : 'N/A'}</small></td>
        <td>
          <button class="btn btn-sm btn-outline-success view-case-btn" data-case-id="${v.id}" type="button">
            <i class="bi bi-eye"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Attach event listeners to view buttons
  tbody.querySelectorAll('.view-case-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const caseId = this.getAttribute('data-case-id');
      if (caseId) {
        viewCase(caseId);
      }
    });
  });

  // Attach event listeners to table rows
  tbody.querySelectorAll('.case-row').forEach(row => {
    row.addEventListener('click', function(e) {
      // Don't trigger if clicking on the button
      if (e.target.closest('.view-case-btn')) {
        return;
      }
      const caseId = this.getAttribute('data-case-id');
      if (caseId) {
        viewCase(caseId);
      }
    });
  });
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
          <div id="qrCodeSection" style="display: none;">
            <p><strong>QR Passport:</strong></p>
            <div class="mb-2 text-center">
              <img id="qrCodeImage" src="" alt="QR Code" class="img-fluid border border-success rounded" style="max-width: 250px; max-height: 250px;" />
            </div>
            <div class="text-center">
              <button class="btn btn-success" onclick="downloadQrCode()">
                <i class="bi bi-download"></i> Download QR Code
              </button>
            </div>
            <small class="text-muted d-block mt-2 text-center">
              Share this QR code with the user for login access
            </small>
          </div>
        </div>
        <div class="col-12 mb-3">
          <h6 class="text-success">Risk Factors</h6>
          <pre class="bg-dark p-3 border border-success rounded">${JSON.stringify(verification.factors || {}, null, 2)}</pre>
        </div>
        <div class="col-12 mb-3">
          <h6 class="text-success">Admin Notes</h6>
          <textarea class="form-control bg-dark text-light border-success" id="adminNotes" rows="3"></textarea>
        </div>
        <div class="col-12">
          ${verification.status === 'approved' ? '' : `
          <button class="btn btn-outline-success" onclick="generateQrForUser(${verification.userId})" id="generateQrBtn">
            <i class="bi bi-qr-code"></i> Generate QR Passport
          </button>
          `}
        </div>
      </div>
    `;

    // Show/hide action buttons based on status
    if (verification.status === 'pending') {
      approveBtn.style.display = 'inline-block';
      denyBtn.style.display = 'inline-block';
    } else if (verification.status === 'approved') {
      // If already approved, hide approve/deny buttons and show QR if available
      approveBtn.style.display = 'none';
      denyBtn.style.display = 'none';
      // Try to get QR code if user is already approved (but don't show error if it fails)
      generateQrForUser(verification.userId).catch(err => {
        console.log('QR code not yet generated for this user');
      });
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
    const approveBtn = document.getElementById('approveBtn');
    const denyBtn = document.getElementById('denyBtn');

    // Disable buttons during approval
    if (approveBtn) approveBtn.disabled = true;
    if (denyBtn) denyBtn.disabled = true;

    // Approve verification via API
    const result = await API.approveVerification(currentCaseId, adminNotes);
    
    // Show QR code to admin in the modal
    if (result.qrCodeBase64) {
      const qrSection = document.getElementById('qrCodeSection');
      const qrImage = document.getElementById('qrCodeImage');
      const generateQrBtn = document.getElementById('generateQrBtn');
      
      if (qrSection && qrImage) {
        qrImage.src = `data:image/png;base64,${result.qrCodeBase64}`;
        qrSection.style.display = 'block';
        // Store QR data for download
        window.currentQrCodeBase64 = result.qrCodeBase64;
        window.currentQrUserId = result.userId;
        
        // Hide the generate QR button since we already have one
        if (generateQrBtn) {
          generateQrBtn.style.display = 'none';
        }
      }
      
      // Update status badge in modal
      const statusBadge = document.querySelector('#caseModalBody .col-md-6:last-child p:first-child');
      if (statusBadge) {
        statusBadge.innerHTML = `<strong>Status:</strong> ${getStatusBadge('approved')}`;
      }
      
      // Hide approve/deny buttons and show success message
      if (approveBtn) {
        approveBtn.style.display = 'none';
        approveBtn.disabled = false;
      }
      if (denyBtn) {
        denyBtn.style.display = 'none';
        denyBtn.disabled = false;
      }
      
      // Show success alert in modal
      const modalBody = document.getElementById('caseModalBody');
      if (modalBody) {
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-success alert-dismissible fade show';
        alertDiv.innerHTML = `
          <strong>Verification Approved!</strong> QR Passport generated successfully. Download and share the QR code with the user.
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="alert"></button>
        `;
        modalBody.insertBefore(alertDiv, modalBody.firstChild);
      }
    } else {
      showAlert('Verification approved, but QR code generation failed. Please try generating QR code manually.', 'warning');
    }

    // Refresh dashboard data (but keep modal open)
    allVerifications = await API.getVerifications();
    await updateStats();
    await displayCases();

    showAlert('Verification approved successfully. QR code is displayed in the modal.', 'success');
  } catch (error) {
    console.error('Failed to approve case:', error);
    showAlert('Failed to approve verification. Please try again.', 'danger');
    
    // Re-enable buttons on error
    const approveBtn = document.getElementById('approveBtn');
    const denyBtn = document.getElementById('denyBtn');
    if (approveBtn) approveBtn.disabled = false;
    if (denyBtn) denyBtn.disabled = false;
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

async function applyFilters() {
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
      const nameA = a.name || '';
      const nameB = b.name || '';
      return nameA.localeCompare(nameB);
    });
  }

  // Display filtered results
  const tbody = document.getElementById('casesTableBody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No cases match filters</td></tr>';
    return;
  }

  const ranked = RiskFilter.rankVerifications(filtered);
  
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
    const passportDisplay = '<span class="text-muted">Check details</span>';

    return `
      <tr class="case-row" data-case-id="${v.id}">
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
        <td><small>${v.createdAt ? new Date(v.createdAt).toLocaleDateString() : 'N/A'}</small></td>
        <td>
          <button class="btn btn-sm btn-outline-success view-case-btn" data-case-id="${v.id}" type="button">
            <i class="bi bi-eye"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Attach event listeners to view buttons
  tbody.querySelectorAll('.view-case-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const caseId = this.getAttribute('data-case-id');
      if (caseId) {
        viewCase(caseId);
      }
    });
  });

  // Attach event listeners to table rows
  tbody.querySelectorAll('.case-row').forEach(row => {
    row.addEventListener('click', function(e) {
      // Don't trigger if clicking on the button
      if (e.target.closest('.view-case-btn')) {
        return;
      }
      const caseId = this.getAttribute('data-case-id');
      if (caseId) {
        viewCase(caseId);
      }
    });
  });
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

// Download QR code
function downloadQrCode() {
  const qrBase64 = window.currentQrCodeBase64;
  if (!qrBase64) {
    // Show alert in modal if available
    const modalBody = document.getElementById('caseModalBody');
    if (modalBody) {
      const alertDiv = document.createElement('div');
      alertDiv.className = 'alert alert-warning alert-dismissible fade show';
      alertDiv.innerHTML = `
        No QR code available to download. Please approve the user first.
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="alert"></button>
      `;
      modalBody.insertBefore(alertDiv, modalBody.firstChild);
    } else {
      showAlert('No QR code available to download.', 'warning');
    }
    return;
  }

  // Create download link
  const link = document.createElement('a');
  link.href = `data:image/png;base64,${qrBase64}`;
  link.download = `biotrust-passport-${window.currentQrUserId || 'qr'}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Show success message in modal
  const modalBody = document.getElementById('caseModalBody');
  if (modalBody) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-success alert-dismissible fade show';
    alertDiv.innerHTML = `
      QR code downloaded successfully!
      <button type="button" class="btn-close btn-close-white" data-bs-dismiss="alert"></button>
    `;
    modalBody.insertBefore(alertDiv, modalBody.firstChild);
  }
}

// Generate QR code for a user (admin only)
async function generateQrForUser(userId) {
  try {
    const generateQrBtn = document.getElementById('generateQrBtn');
    if (generateQrBtn) {
      generateQrBtn.disabled = true;
      generateQrBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generating...';
    }

    const result = await API.generateQr(userId);
    
    if (result.qrCodeBase64) {
      const qrSection = document.getElementById('qrCodeSection');
      const qrImage = document.getElementById('qrCodeImage');
      if (qrSection && qrImage) {
        qrImage.src = `data:image/png;base64,${result.qrCodeBase64}`;
        qrSection.style.display = 'block';
        window.currentQrCodeBase64 = result.qrCodeBase64;
        window.currentQrUserId = result.userId;
        
        // Hide the generate button since we have a QR code now
        if (generateQrBtn) {
          generateQrBtn.style.display = 'none';
        }
        
        // Show success message in modal
        const modalBody = document.getElementById('caseModalBody');
        if (modalBody) {
          const alertDiv = document.createElement('div');
          alertDiv.className = 'alert alert-success alert-dismissible fade show';
          alertDiv.innerHTML = `
            QR Passport generated successfully! Download and share with the user.
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="alert"></button>
          `;
          modalBody.insertBefore(alertDiv, modalBody.firstChild);
        }
      }
    }
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    const modalBody = document.getElementById('caseModalBody');
    if (modalBody) {
      const alertDiv = document.createElement('div');
      alertDiv.className = 'alert alert-danger alert-dismissible fade show';
      alertDiv.innerHTML = `
        Failed to generate QR code: ${error.message || 'Please try again.'}
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="alert"></button>
      `;
      modalBody.insertBefore(alertDiv, modalBody.firstChild);
    } else {
      showAlert('Failed to generate QR code. Please try again.', 'danger');
    }
  } finally {
    const generateQrBtn = document.getElementById('generateQrBtn');
    if (generateQrBtn) {
      generateQrBtn.disabled = false;
      generateQrBtn.innerHTML = '<i class="bi bi-qr-code"></i> Generate QR Passport';
    }
  }
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
