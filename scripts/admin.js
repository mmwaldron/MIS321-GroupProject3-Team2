// Admin Dashboard Logic
let currentCaseId = null;
let allVerifications = [];

async function loadDashboard() {
  // Check if user is actually logged in as admin before loading
  const userId = localStorage.getItem('currentUserId');
  const userClassification = localStorage.getItem('userClassification');
  
  if (!userId || userClassification !== 'admin') {
    // Not logged in as admin, don't load dashboard or show notifications
    console.log('User not authenticated as admin, skipping dashboard load');
    return;
  }
  
  try {
    allVerifications = await API.getVerifications();
    console.log('Loaded verifications:', allVerifications.length, allVerifications);
    await updateStats();
    await displayCases();
    // Only check alerts after confirming admin is logged in
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

  // Check if there's a search term - if so, use applyFilters instead
  const searchName = document.getElementById('searchName')?.value?.toLowerCase().trim() || '';
  if (searchName) {
    await applyFilters();
    return;
  }

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

function getRiskColor(riskLevel) {
  const colors = {
    'high': 'danger',
    'medium': 'warning',
    'low': 'success'
  };
  return colors[riskLevel] || 'secondary';
}

function getSeverityColor(severity) {
  const colors = {
    'info': 'info',
    'low': 'success',
    'medium': 'warning',
    'high': 'danger'
  };
  return colors[severity] || 'secondary';
}

function formatIdType(idType) {
  const types = {
    'drivers_license': "Driver's License",
    'passport': 'Passport',
    'state_id': 'State ID',
    'military_id': 'Military ID',
    'permanent_resident': 'Permanent Resident Card',
    'other': 'Other'
  };
  return types[idType] || idType;
}

function formatFieldName(key) {
  const names = {
    'idNumber': 'ID Number',
    'name': 'Name',
    'dateOfBirth': 'Date of Birth',
    'expirationDate': 'Expiration Date',
    'address': 'Address',
    'nationality': 'Nationality'
  };
  return names[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

function generateDocumentsHtml(documents) {
  if (!documents || documents.length === 0) {
    return `
      <div class="col-12 mb-3">
        <h6 class="text-success">Uploaded Documents</h6>
        <div class="alert alert-warning">
          <i class="bi bi-exclamation-triangle"></i> No documents uploaded
        </div>
      </div>
    `;
  }
  
  return `
    <div class="col-12 mb-3">
      <h6 class="text-success">Uploaded Documents</h6>
      ${documents.map(doc => {
        // Parse JSON strings if needed
        let idAnalysis = {};
        let analysis = {};
        let extractedData = {};
        
        try {
          if (typeof doc.idAnalysis === 'string') {
            idAnalysis = JSON.parse(doc.idAnalysis);
          } else {
            idAnalysis = doc.idAnalysis || {};
          }
          
          if (typeof doc.analysis === 'string') {
            analysis = JSON.parse(doc.analysis);
          } else {
            analysis = doc.analysis || {};
          }
          
          if (typeof doc.extractedData === 'string') {
            extractedData = JSON.parse(doc.extractedData);
          } else {
            extractedData = doc.extractedData || {};
          }
        } catch (e) {
          console.error('Error parsing document data:', e);
          idAnalysis = doc.idAnalysis || {};
          analysis = doc.analysis || {};
          extractedData = doc.extractedData || {};
        }
        
        return `
          <div class="card bg-dark border-${getRiskColor(idAnalysis.riskLevel || 'low')} mb-2">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <div class="flex-grow-1">
                  <h6 class="mb-1">
                    <i class="bi bi-file-earmark"></i> ${doc.fileName}
                  </h6>
                  <p class="mb-1 text-muted">
                    <small>
                      ${(doc.fileSize / 1024).toFixed(2)} KB • 
                      ${doc.fileType.toUpperCase()} • 
                      Risk: <span class="badge bg-${getRiskColor(idAnalysis.riskLevel || 'low')}">
                        ${idAnalysis.riskLevel || 'unknown'}
                      </span>
                    </small>
                  </p>
                  ${doc.idType ? `<p class="mb-1"><small><strong>ID Type:</strong> ${formatIdType(doc.idType)}</small></p>` : ''}
                </div>
                <div>
                  <a href="${API_CONFIG.getUrl(`/verifications/document/${doc.id}`)}"
                     target="_blank"
                     class="btn btn-sm btn-outline-success">
                    <i class="bi bi-download"></i> View
                  </a>
                </div>
              </div>
              
              ${idAnalysis.extractedFields && Object.keys(idAnalysis.extractedFields).length > 0 ? `
                <div class="mb-2">
                  <strong>Extracted Information:</strong>
                  <ul class="list-unstyled mt-1 mb-0">
                    ${Object.entries(idAnalysis.extractedFields).map(([key, value]) => `
                      <li><small><strong>${formatFieldName(key)}:</strong> ${value || 'N/A'}</small></li>
                    `).join('')}
                  </ul>
                </div>
              ` : ''}
              
              ${idAnalysis.flags && idAnalysis.flags.length > 0 ? `
                <div class="mb-2">
                  <strong>ID Validation Flags:</strong>
                  <div class="list-group list-group-flush mt-1">
                    ${idAnalysis.flags.map(flag => `
                      <div class="list-group-item bg-dark border-${getSeverityColor(flag.severity)} px-0 py-1">
                        <div class="d-flex justify-content-between align-items-start">
                          <div>
                            <span class="badge bg-${getSeverityColor(flag.severity)} me-1">
                              ${flag.severity.toUpperCase()}
                            </span>
                            <small>${flag.message}</small>
                          </div>
                        </div>
                        <small class="text-muted d-block mt-1">${flag.impact}</small>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
              
              ${analysis.flags && analysis.flags.length > 0 ? `
                <div class="mb-2">
                  <strong>Document Analysis Flags:</strong>
                  <div class="list-group list-group-flush mt-1">
                    ${analysis.flags.map(flag => `
                      <div class="list-group-item bg-dark border-${getSeverityColor(flag.severity)} px-0 py-1">
                        <div class="d-flex justify-content-between align-items-start">
                          <div>
                            <span class="badge bg-${getSeverityColor(flag.severity)} me-1">
                              ${flag.severity.toUpperCase()}
                            </span>
                            <small>${flag.message}</small>
                          </div>
                        </div>
                        <small class="text-muted d-block mt-1">${flag.impact}</small>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
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
    
    // Fetch documents for this verification
    let documents = [];
    try {
      const documentsResponse = await API.getVerificationDocuments(caseId);
      if (Array.isArray(documentsResponse)) {
        documents = documentsResponse;
      } else if (documentsResponse && Array.isArray(documentsResponse.data)) {
        documents = documentsResponse.data;
      }
      console.log('Fetched documents for verification ID:', caseId, 'Found', documents.length, 'documents:', documents);
    } catch (error) {
      console.error('Failed to fetch documents for verification ID:', caseId, error);
      // Still show the documents section even if fetch fails
    }

    // Parse risk analysis if available
    let riskAnalysisHtml = '';
    if (verification.riskAnalysis) {
      const riskAnalysis = verification.riskAnalysis;
      
      riskAnalysisHtml = `
        <div class="col-12 mb-3">
          <h6 class="text-success">Risk Analysis</h6>
          <div class="card bg-dark border-${getRiskColor(riskAnalysis.riskLevel)}">
            <div class="card-body">
              <div class="row">
                <div class="col-md-6">
                  <p><strong class="text-light">Overall Risk Score:</strong> 
                    <span class="badge bg-${getRiskColor(riskAnalysis.riskLevel)}">
                      ${riskAnalysis.overallRiskScore.toFixed(1)} / 100
                    </span>
                  </p>
                  <p><strong class="text-light">Risk Level:</strong> ${getRiskBadge(riskAnalysis.riskLevel)}</p>
                </div>
                <div class="col-md-6">
                  <p><strong>Total Flags:</strong> ${riskAnalysis.flags.length}</p>
                  <p><strong>High Severity:</strong> 
                    ${riskAnalysis.flags.filter(f => f.severity === 'high').length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="col-12 mb-3">
          <h6 class="text-success">Risk Flags</h6>
          <div class="list-group">
            ${riskAnalysis.flags.map(flag => `
              <div class="list-group-item bg-dark border-${getSeverityColor(flag.severity)}">
                <div class="d-flex justify-content-between align-items-start">
                  <div>
                    <h6 class="mb-1">
                      <span class="badge bg-${getSeverityColor(flag.severity)}">${flag.severity.toUpperCase()}</span>
                      ${flag.message}
                    </h6>
                    <p class="mb-0 text-muted"><small>${flag.impact}</small></p>
                  </div>
                  <small class="text-muted">${flag.type}</small>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div class="col-12 mb-3">
          <h6 class="text-success">Recommendations</h6>
          <ul class="list-group">
            ${riskAnalysis.recommendations.map(rec => `
              <li class="list-group-item bg-dark border-success">
                <i class="bi bi-check-circle text-success"></i> ${rec}
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    // Log verification details for debugging
    console.log('Viewing verification:', {
      id: caseId,
      userId: verification.userId,
      status: verification.status,
      name: verification.name,
      email: verification.email
    });

    modalBody.innerHTML = `
      <div class="row">
        <div class="col-md-6 mb-3">
          <h6 class="text-success">User Information</h6>
          <p><strong>Name:</strong> ${verification.name || 'N/A'}</p>
          <p><strong>Email:</strong> ${verification.email || user?.email || 'N/A'}</p>
          <p><small class="text-muted">Verification ID: ${caseId} | User ID: ${verification.userId}</small></p>
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
            <div class="card bg-dark border-success mb-3">
              <div class="card-body text-center">
                <h6 class="text-success mb-3">
                  <i class="bi bi-qr-code"></i> QR Passport Code
                </h6>
                <div class="mb-3">
                  <img id="qrCodeImage" src="" alt="QR Code" class="img-fluid border border-success rounded shadow" style="max-width: 300px; max-height: 300px; background: white; padding: 10px;" />
                </div>
                <div class="d-flex gap-2 justify-content-center">
                  <button class="btn btn-success btn-lg" onclick="downloadQrCode()">
                    <i class="bi bi-download"></i> Download QR Code
                  </button>
                </div>
                <small class="text-muted d-block mt-3">
                  <i class="bi bi-info-circle"></i> Share this QR code with the user for login access
                </small>
              </div>
            </div>
          </div>
        </div>
        ${riskAnalysisHtml}
        ${generateDocumentsHtml(documents)}
        <div class="col-12 mb-3">
          <h6 class="text-success">Risk Factors</h6>
          <pre class="bg-dark p-3 border border-success rounded">${JSON.stringify(verification.factors || {}, null, 2)}</pre>
        </div>
        <div class="col-12 mb-3">
          <h6 class="text-success">Admin Notes</h6>
          <textarea class="form-control bg-dark text-light border-success" id="adminNotes" rows="3"></textarea>
        </div>
      </div>
    `;

    // Show/hide action buttons based on status
    if (verification.status === 'pending') {
      approveBtn.style.display = 'inline-block';
      denyBtn.style.display = 'inline-block';
    } else if (verification.status === 'approved') {
      // If already approved, hide approve/deny buttons and generate QR code
      approveBtn.style.display = 'none';
      denyBtn.style.display = 'none';
      
      // Automatically generate and display QR code for approved users
      if (verification.userId) {
        try {
          await generateQrForUser(verification.userId);
        } catch (error) {
          console.error('Failed to generate QR code for approved user:', error);
          // Don't show error to user, just log it
        }
      }
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
        
        // Scroll to QR code section to make it visible
        setTimeout(() => {
          qrSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
      
      // Update status badge in modal
      const statusBadge = document.querySelector('#caseModalBody .col-md-6:last-child p:first-child');
      if (statusBadge) {
        statusBadge.innerHTML = `<strong>Status:</strong> ${getStatusBadge('approved')}`;
      }
      
      // Hide approve/deny buttons
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
          <strong><i class="bi bi-check-circle"></i> Verification Approved!</strong> QR Passport generated successfully. Download the QR code below and share it with the user.
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
  const searchName = document.getElementById('searchName')?.value?.toLowerCase().trim() || '';

  // Filter to only show pending users by default
  let filtered = allVerifications.filter(v => v.status === 'pending');

  // Filter by name if search term provided
  if (searchName) {
    filtered = filtered.filter(v => {
      const name = (v.name || '').toLowerCase();
      return name.includes(searchName);
    });
  }

  // Display filtered results
  const tbody = document.getElementById('casesTableBody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No cases found</td></tr>';
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
    // Verify admin authentication before loading dashboard
    const userId = localStorage.getItem('currentUserId');
    const userClassification = localStorage.getItem('userClassification');
    
    if (!userId || userClassification !== 'admin') {
      // Not logged in as admin, redirect will happen in admin.html script
      // Don't load dashboard or show notifications
      return;
    }
    
    loadDashboard();
    
    // Auto-refresh every 30 seconds (only if admin is logged in)
    setInterval(async () => {
      // Re-check admin status before refresh
      const currentUserId = localStorage.getItem('currentUserId');
      const currentClassification = localStorage.getItem('userClassification');
      
      if (!currentUserId || currentClassification !== 'admin') {
        return; // Stop refreshing if no longer admin
      }
      
      try {
        allVerifications = await API.getVerifications();
        await updateStats();
        await displayCases();
      } catch (error) {
        console.error('Failed to refresh dashboard:', error);
      }
    }, 30000);
  }
});

// Check if user is admin on page load (for admin.html)
(function checkAdminAuth() {
  // Only run on admin.html
  if (!window.location.pathname.includes('admin.html')) {
    return;
  }
  
  const userId = localStorage.getItem('currentUserId');
  const userClassification = localStorage.getItem('userClassification');
  
  if (!userId || userClassification !== 'admin') {
    // Not logged in as admin, redirect to index
    localStorage.clear();
    window.location.replace('index.html');
  }
})();
