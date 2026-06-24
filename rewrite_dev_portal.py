import re

file_name = 'js/developer-portal.js'
with open(file_name, 'r') as f:
    content = f.read()

# 1. Update loadChurches to fix action buttons
old_church_row = """                    <div class="developer-action-row">
                        <button class="developer-icon-btn" title="Approve" data-action="approve-church" data-id="${escapeHtml(church.placeId || church.id)}"><i class="fas fa-check"></i></button>
                        <button class="developer-icon-btn" title="Reject" data-action="reject-church" data-id="${escapeHtml(church.placeId || church.id)}"><i class="fas fa-xmark"></i></button>
                        <button class="developer-icon-btn danger" title="Suspend" data-action="suspend-church" data-id="${escapeHtml(church.placeId || church.id)}"><i class="fas fa-ban"></i></button>
                    </div>"""

new_church_row = """                    <div class="developer-action-row">
                        <button class="developer-icon-btn" title="View Details" data-action="view-church" data-church='${escapeHtml(JSON.stringify(church))}'><i class="fas fa-eye"></i></button>
                    </div>"""
content = content.replace(old_church_row, new_church_row)

# 2. Add handleAction logic for "view-church"
old_handle_action = """            if (action === 'approve-church') {"""

new_handle_action = """            if (action === 'view-church') {
                const churchStr = button.dataset.church;
                if (churchStr) {
                    const church = JSON.parse(churchStr);
                    document.getElementById('churchDetailModal').style.display = 'flex';
                    document.getElementById('churchDetailTitle').textContent = church.name;
                    
                    document.getElementById('churchDetailBody').innerHTML = `
                        <div class="developer-detail-grid">
                            <div class="developer-detail-item"><strong>Address:</strong> <span>${escapeHtml(church.address || 'N/A')}</span></div>
                            <div class="developer-detail-item"><strong>Denomination:</strong> <span>${escapeHtml(church.denomination || 'N/A')}</span></div>
                            <div class="developer-detail-item"><strong>Contact Name:</strong> <span>${escapeHtml(church.pastor_or_admin_name || 'N/A')}</span></div>
                            <div class="developer-detail-item"><strong>Contact Email:</strong> <span>${escapeHtml(church.pastor_or_admin_email || 'N/A')}</span></div>
                            <div class="developer-detail-item"><strong>Status:</strong> <span>${statusBadge(church.approval_status || church.status)}</span></div>
                        </div>
                    `;
                    
                    let actionsHtml = '';
                    const status = (church.approval_status || church.status || '').toLowerCase();
                    if (status === 'pending' || status === 'submitted' || status === 'under_review') {
                        actionsHtml = `
                            <button class="btn btn-primary" data-action="approve-church" data-id="${escapeHtml(church.placeId || church.id)}">Approve</button>
                            <button class="btn btn-secondary danger" data-action="reject-church" data-id="${escapeHtml(church.placeId || church.id)}">Reject</button>
                        `;
                    } else if (status === 'approved') {
                        actionsHtml = `
                            <button class="btn btn-secondary danger" data-action="suspend-church" data-id="${escapeHtml(church.placeId || church.id)}">Suspend</button>
                        `;
                    }
                    document.getElementById('churchDetailActions').innerHTML = actionsHtml;
                }
                return;
            }
            
            // Close modal after approving, rejecting, suspending
            if (['approve-church', 'reject-church', 'suspend-church'].includes(action)) {
                document.getElementById('churchDetailModal').style.display = 'none';
            }

            if (action === 'approve-church') {"""
content = content.replace(old_handle_action, new_handle_action)

with open(file_name, "w") as f:
    f.write(content)
