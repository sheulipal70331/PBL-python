/**
 * Campus Event Management & Feedback Analyzer - Client-side Application
 */

// Global State
let appState = {
    events: [],
    students: [],
    registrations: [],
    feedback: [],
    stats: {},
    activeTab: 'dashboard',
    currentParticipantEventId: null
};

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initStarRating();
    initGlobalListeners();
    setMinDateOnPickers();
    refreshAllData();
});

// --------------------------------------------------------------------------
// Date Picker - Prevent Past Dates
// --------------------------------------------------------------------------
function setMinDateOnPickers() {
    const today = new Date().toISOString().split('T')[0];
    const datePickers = [
        document.getElementById('create-event-date'),
        document.getElementById('edit-event-date')
    ];
    datePickers.forEach(picker => {
        if (picker) picker.setAttribute('min', today);
    });
}

// --------------------------------------------------------------------------
// Navigation & Tabs
// --------------------------------------------------------------------------
function initNavigation() {
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    appState.activeTab = tabName;
    
    // Update nav buttons
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });

    // Update tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });

    // Refresh charts if opening analytics tab
    if (tabName === 'analytics') {
        refreshChartsAndAnalysis();
    }
}

// --------------------------------------------------------------------------
// Data Fetching & Sync
// --------------------------------------------------------------------------
async function refreshAllData() {
    try {
        await Promise.all([
            fetchStats(),
            fetchEvents(),
            fetchStudents(),
            fetchRegistrations(),
            fetchFeedback(),
            fetchAnalysis()
        ]);
        populateDropdowns();
    } catch (err) {
        console.error("Error refreshing data:", err);
    }
}

async function fetchStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        appState.stats = data;

        // Update dashboard KPI numbers
        document.getElementById('kpi-events').textContent = data.total_events || 0;
        document.getElementById('kpi-students').textContent = data.total_students || 0;
        document.getElementById('kpi-registrations').textContent = data.total_registrations || 0;
        
        const avg = data.overall_average_rating;
        document.getElementById('kpi-rating').textContent = avg !== null && avg !== undefined ? `${avg} ★` : '-- ★';
        document.getElementById('kpi-feedback-count').textContent = `${data.total_feedback || 0} Reviews`;
        document.getElementById('kpi-full-events-badge').textContent = `${data.full_events_count || 0} Full`;

        // Update tab counters
        document.getElementById('badge-event-count').textContent = data.total_events || 0;
        document.getElementById('badge-student-count').textContent = data.total_students || 0;
        document.getElementById('badge-reg-count').textContent = data.total_registrations || 0;
        document.getElementById('badge-feedback-count').textContent = data.total_feedback || 0;
    } catch (e) {
        console.error("Failed to fetch stats", e);
    }
}

async function fetchEvents() {
    try {
        const res = await fetch('/api/events');
        const data = await res.json();
        appState.events = data;
        renderEvents();
        renderDashboardEvents();
    } catch (e) {
        console.error("Failed to fetch events", e);
    }
}

async function fetchStudents() {
    try {
        const res = await fetch('/api/students');
        const data = await res.json();
        appState.students = data;
        renderStudents();
    } catch (e) {
        console.error("Failed to fetch students", e);
    }
}

async function fetchRegistrations() {
    try {
        const res = await fetch('/api/registrations');
        const data = await res.json();
        appState.registrations = data;
        renderRegistrations();
    } catch (e) {
        console.error("Failed to fetch registrations", e);
    }
}

async function fetchFeedback() {
    try {
        const res = await fetch('/api/feedback');
        const data = await res.json();
        appState.feedback = data;
        renderFeedback();
    } catch (e) {
        console.error("Failed to fetch feedback", e);
    }
}

async function fetchAnalysis() {
    try {
        const res = await fetch('/api/analysis');
        const data = await res.json();
        renderAnalysisTable(data.summary || []);
    } catch (e) {
        console.error("Failed to fetch analysis", e);
    }
}

// --------------------------------------------------------------------------
// Render Functions
// --------------------------------------------------------------------------
function renderEvents() {
    const grid = document.getElementById('events-grid');
    const filterInput = document.getElementById('filter-events');
    const keyword = (filterInput?.value || '').toLowerCase().trim();

    const filtered = appState.events.filter(e => {
        return !keyword || 
            e.name.toLowerCase().includes(keyword) || 
            e.event_id.toLowerCase().includes(keyword) || 
            e.venue.toLowerCase().includes(keyword);
    });

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 0.75rem; opacity: 0.5;">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                </svg>
                <p>No events found matching your criteria.</p>
                <button class="btn btn-primary btn-sm" style="margin-top: 1rem;" onclick="openModal('modal-create-event')">Create One Now</button>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(e => {
        const isFull = e.is_full;
        const isCompleted = e.status === 'Completed';
        let fillClass = 'fill-green';
        if (e.fill_pct >= 90) fillClass = 'fill-red';
        else if (e.fill_pct >= 70) fillClass = 'fill-amber';

        const statusBadge = isCompleted
            ? '<span class="badge badge-rose" style="background: rgba(16,185,129,0.15); color: #10b981; border-color: rgba(16,185,129,0.3);">✓ COMPLETED</span>'
            : '<span class="badge badge-emerald" style="background: rgba(99,102,241,0.15); color: #818cf8; border-color: rgba(99,102,241,0.3);">UPCOMING</span>';

        return `
            <div class="event-card${isCompleted ? ' event-completed' : ''}">
                <div>
                    <div class="event-card-header">
                        <span class="event-id-tag">${escapeHtml(e.event_id)}</span>
                        ${statusBadge}
                        ${isFull ? 
                            '<span class="badge badge-rose">SEATS FULL</span>' : 
                            `<span class="badge badge-emerald">${e.available_seats} Seats Available</span>`
                        }
                    </div>
                    <h3 class="event-card-title">${escapeHtml(e.name)}</h3>
                    <div class="event-card-meta">
                        <div class="meta-item">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line></svg>
                            <span>${escapeHtml(e.date)}</span>
                        </div>
                        <div class="meta-item">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                            <span>${escapeHtml(e.venue)}</span>
                        </div>
                    </div>
                    <div class="capacity-meter-box">
                        <div class="capacity-labels">
                            <span>Capacity: <strong>${e.participants} / ${e.max_participants}</strong></span>
                            <span>${e.fill_pct}%</span>
                        </div>
                        <div class="capacity-track">
                            <div class="capacity-fill ${fillClass}" style="width: ${Math.min(e.fill_pct, 100)}%;"></div>
                        </div>
                    </div>
                </div>
                <div class="event-card-actions">
                    <button class="btn btn-sm btn-secondary" onclick="viewParticipants('${escapeHtml(e.event_id)}', '${escapeHtml(e.name)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
                        Attendees (${e.participants})
                    </button>
                    ${!isFull && !isCompleted ? `
                        <button class="btn btn-sm btn-primary" onclick="quickRegisterForEvent('${escapeHtml(e.event_id)}')">
                            Register
                        </button>
                    ` : ''}
                    <button class="btn btn-sm btn-ghost" title="Edit Event" onclick="openEditEventModal('${escapeHtml(e.event_id)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="btn btn-sm btn-ghost text-danger" title="Delete Event" onclick="deleteEvent('${escapeHtml(e.event_id)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderDashboardEvents() {
    const list = document.getElementById('dash-events-list');
    if (!list) return;

    if (appState.events.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No active events yet. Click "Load Demo Data" or create one above!</div>`;
        return;
    }

    list.innerHTML = appState.events.slice(0, 4).map(e => {
        const isCompleted = e.status === 'Completed';
        return `
        <div class="dash-event-row">
            <div>
                <strong style="color: var(--text-primary); font-size: 0.95rem;">${escapeHtml(e.name)}</strong>
                <div style="font-size: 0.8rem; color: var(--text-muted);">
                    ${escapeHtml(e.date)} &bull; ${escapeHtml(e.venue)}
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span style="font-size: 0.82rem; font-weight: 700; color: ${e.is_full ? 'var(--rose)' : 'var(--cyan)'};">
                    ${e.participants}/${e.max_participants}
                </span>
                ${isCompleted
                    ? '<span class="badge" style="background: rgba(16,185,129,0.15); color: #10b981; border-color: rgba(16,185,129,0.3);">✓ COMPLETED</span>'
                    : (e.is_full ? '<span class="badge badge-rose">FULL</span>' : '<span class="badge badge-emerald">OPEN</span>')}
            </div>
        </div>
    `}).join('');
}

function renderStudents() {
    const tbody = document.getElementById('students-table-body');
    const filterInput = document.getElementById('filter-students');
    const keyword = (filterInput?.value || '').toLowerCase().trim();

    const filtered = appState.students.filter(s => {
        return !keyword || 
            s.name.toLowerCase().includes(keyword) || 
            s.student_id.toLowerCase().includes(keyword) || 
            s.email.toLowerCase().includes(keyword);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 2rem;">No students found matching query.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(s => {
        const eventsPills = s.enrolled_events.map(ev => 
            `<span class="badge badge-indigo" style="margin-right: 4px; margin-bottom: 2px;">${escapeHtml(ev.name)}</span>`
        ).join('') || '<span class="text-muted" style="font-size: 0.8rem;">No events enrolled</span>';

        return `
            <tr>
                <td><strong style="font-family: 'JetBrains Mono', monospace; color: #a5b4fc;">${escapeHtml(s.student_id)}</strong></td>
                <td><strong>${escapeHtml(s.name)}</strong></td>
                <td style="color: var(--text-secondary);">${escapeHtml(s.email)}</td>
                <td>${eventsPills}</td>
                <td class="text-right">
                    <button class="btn btn-sm btn-ghost" title="Edit student" onclick="openEditStudentModal('${escapeHtml(s.student_id)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        Edit
                    </button>
                    <button class="btn btn-sm btn-ghost text-danger" title="Remove student" onclick="deleteStudent('${escapeHtml(s.student_id)}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        Remove
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderRegistrations() {
    const tbody = document.getElementById('registrations-table-body');
    const filterInput = document.getElementById('filter-registrations');
    const keyword = (filterInput?.value || '').toLowerCase().trim();

    const filtered = appState.registrations.filter(r => {
        return !keyword || 
            r.event_name.toLowerCase().includes(keyword) || 
            r.student_name.toLowerCase().includes(keyword) || 
            r.student_id.toLowerCase().includes(keyword) || 
            r.event_id.toLowerCase().includes(keyword);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 2rem;">No registrations found. Register a student using the form on the left!</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(r => `
        <tr>
            <td>
                <strong>${escapeHtml(r.event_name)}</strong>
                <div style="font-size: 0.75rem; color: var(--text-muted); font-family: 'JetBrains Mono';">${escapeHtml(r.event_id)}</div>
            </td>
            <td>
                <strong>${escapeHtml(r.student_name)}</strong>
                <div style="font-size: 0.75rem; color: #a5b4fc; font-family: 'JetBrains Mono';">${escapeHtml(r.student_id)}</div>
            </td>
            <td style="color: var(--text-secondary);">${escapeHtml(r.student_email)}</td>
            <td class="text-right">
                <button class="btn btn-sm btn-ghost text-danger" onclick="cancelRegistration('${escapeHtml(r.event_id)}', '${escapeHtml(r.student_id)}')">
                    Cancel Registration
                </button>
            </td>
        </tr>
    `).join('');
}

function renderFeedback() {
    const container = document.getElementById('feedback-stream');
    const overallBadge = document.getElementById('fb-overall-badge');
    const avg = appState.stats.overall_average_rating;
    if (overallBadge) {
        overallBadge.textContent = avg !== null && avg !== undefined ? `${avg} ★ Overall Rating` : 'No Ratings Yet';
    }

    if (appState.feedback.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 0.5rem; opacity: 0.5;">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
                <p>No feedback reviews recorded yet.</p>
                <p style="font-size: 0.8rem;">Registered students can leave their ratings using the form on the left.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = appState.feedback.map(f => {
        const starStr = '★'.repeat(f.rating) + '☆'.repeat(5 - f.rating);
        return `
            <div class="feedback-card">
                <div class="fb-card-header">
                    <span class="fb-student-info">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        ${escapeHtml(f.student_name)}
                    </span>
                    <span class="fb-stars">${starStr}</span>
                </div>
                <div class="fb-event-name">${escapeHtml(f.event_name)}</div>
                ${f.comment ? `<div class="fb-comment">"${escapeHtml(f.comment)}"</div>` : '<div class="fb-comment" style="color: var(--text-muted);">(No written comment)</div>'}
            </div>
        `;
    }).join('');
}

function renderAnalysisTable(records) {
    const tbody = document.getElementById('analytics-table-body');
    if (!tbody) return;

    if (!records || records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 2rem;">No data available for analytical summary. Add events and registrations to populate!</td></tr>`;
        return;
    }

    tbody.innerHTML = records.map(r => `
        <tr>
            <td><strong style="font-family: 'JetBrains Mono'; color: #a5b4fc;">${escapeHtml(r.event_id)}</strong></td>
            <td><strong>${escapeHtml(r.event_name)}</strong></td>
            <td style="font-weight: 700; color: var(--cyan);">${r.participants}</td>
            <td style="color: var(--text-secondary);">${r.capacity}</td>
            <td>
                <span class="badge ${r.fill_pct >= 90 ? 'badge-rose' : r.fill_pct >= 60 ? 'badge-amber' : 'badge-emerald'}">
                    ${r.fill_pct}%
                </span>
            </td>
            <td>
                ${r.avg_rating !== null ? `<strong style="color: #fbbf24;">${r.avg_rating.toFixed(2)} ★</strong>` : '<span class="text-muted">No ratings</span>'}
            </td>
            <td style="color: var(--text-secondary);">${r.feedback_count}</td>
        </tr>
    `).join('');
}

// --------------------------------------------------------------------------
// Populate Dropdowns & Synchronize
// --------------------------------------------------------------------------
function populateDropdowns() {
    // Event selects
    const eventSelects = [
        document.getElementById('reg-select-event'),
        document.getElementById('fb-select-event'),
        document.getElementById('modal-reg-event'),
        document.getElementById('modal-fb-event')
    ];

    eventSelects.forEach(select => {
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '<option value="">-- Choose an Event --</option>' + 
            appState.events.map(e => `
                <option value="${escapeHtml(e.event_id)}">
                    ${escapeHtml(e.name)} (${e.participants}/${e.max_participants} seats ${e.is_full ? '- FULL' : ''})
                </option>
            `).join('');
        if (currentVal) select.value = currentVal;
    });

    // Student selects for Registration
    const studentSelects = [
        document.getElementById('reg-select-student'),
        document.getElementById('modal-reg-student')
    ];

    studentSelects.forEach(select => {
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '<option value="">-- Choose Student --</option>' + 
            appState.students.map(s => `
                <option value="${escapeHtml(s.student_id)}">
                    ${escapeHtml(s.student_id)} - ${escapeHtml(s.name)}
                </option>
            `).join('');
        if (currentVal) select.value = currentVal;
    });

    updateEventSeatPreview();
    filterStudentsForFeedback();
}

function updateEventSeatPreview() {
    const select = document.getElementById('reg-select-event');
    const preview = document.getElementById('reg-seat-preview');
    if (!select || !preview) return;

    const eventId = select.value;
    const event = appState.events.find(e => e.event_id === eventId);
    if (!event) {
        preview.textContent = '';
        return;
    }

    if (event.is_full) {
        preview.innerHTML = `<span style="color: var(--rose);">⚠️ This event is currently FULL (${event.max_participants}/${event.max_participants} seats). Registration is blocked.</span>`;
    } else {
        preview.innerHTML = `<span style="color: var(--emerald);">✓ ${event.available_seats} seat(s) remaining out of ${event.max_participants}.</span>`;
    }
}

function updateModalSeatPreview() {
    const select = document.getElementById('modal-reg-event');
    const preview = document.getElementById('modal-seat-preview');
    if (!select || !preview) return;

    const eventId = select.value;
    const event = appState.events.find(e => e.event_id === eventId);
    if (!event) {
        preview.textContent = '';
        return;
    }

    if (event.is_full) {
        preview.innerHTML = `<span style="color: var(--rose);">⚠️ Event is FULL (${event.max_participants}/${event.max_participants} seats).</span>`;
    } else {
        preview.innerHTML = `<span style="color: var(--emerald);">✓ ${event.available_seats} seat(s) available.</span>`;
    }
}

function filterStudentsForFeedback() {
    const eventSelect = document.getElementById('fb-select-event');
    const studentSelect = document.getElementById('fb-select-student');
    const hint = document.getElementById('fb-student-hint');
    if (!eventSelect || !studentSelect) return;

    const eventId = eventSelect.value;
    if (!eventId) {
        studentSelect.innerHTML = '<option value="">-- Select an Event First --</option>';
        if (hint) hint.textContent = 'Only registered attendees are eligible';
        return;
    }

    // Filter registrations for this event
    const registeredStudentIds = appState.registrations
        .filter(r => r.event_id === eventId)
        .map(r => r.student_id);

    const eligibleStudents = appState.students.filter(s => registeredStudentIds.includes(s.student_id));

    if (eligibleStudents.length === 0) {
        studentSelect.innerHTML = '<option value="">No registered students for this event</option>';
        if (hint) hint.textContent = 'No student has registered for this event yet';
    } else {
        studentSelect.innerHTML = '<option value="">-- Choose Registered Student --</option>' + 
            eligibleStudents.map(s => `
                <option value="${escapeHtml(s.student_id)}">
                    ${escapeHtml(s.student_id)} - ${escapeHtml(s.name)}
                </option>
            `).join('');
        if (hint) hint.textContent = `${eligibleStudents.length} student(s) attended this event`;
    }
}

function filterModalFeedbackStudents() {
    const eventSelect = document.getElementById('modal-fb-event');
    const studentSelect = document.getElementById('modal-fb-student');
    if (!eventSelect || !studentSelect) return;

    const eventId = eventSelect.value;
    if (!eventId) {
        studentSelect.innerHTML = '<option value="">-- Select Event First --</option>';
        return;
    }

    const registeredStudentIds = appState.registrations
        .filter(r => r.event_id === eventId)
        .map(r => r.student_id);

    const eligibleStudents = appState.students.filter(s => registeredStudentIds.includes(s.student_id));

    if (eligibleStudents.length === 0) {
        studentSelect.innerHTML = '<option value="">No registered students for this event</option>';
    } else {
        studentSelect.innerHTML = '<option value="">-- Choose Registered Student --</option>' + 
            eligibleStudents.map(s => `
                <option value="${escapeHtml(s.student_id)}">${escapeHtml(s.student_id)} - ${escapeHtml(s.name)}</option>
            `).join('');
    }
}

// --------------------------------------------------------------------------
// Form Actions (CRUD)
// --------------------------------------------------------------------------

// 1. Create Event
async function handleCreateEventSubmit(e) {
    e.preventDefault();
    const eventId = document.getElementById('create-event-id').value.trim();
    const name = document.getElementById('create-event-name').value.trim();
    const date = document.getElementById('create-event-date').value.trim();
    const venue = document.getElementById('create-event-venue').value.trim();
    const maxParticipants = parseInt(document.getElementById('create-event-max').value, 10);

    try {
        const res = await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_id: eventId,
                name: name,
                date: date,
                venue: venue,
                max_participants: maxParticipants
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast(result.message, 'success');
            closeModal('modal-create-event');
            document.getElementById('form-create-event').reset();
            await refreshAllData();
            refreshChartsAndAnalysis();
        } else {
            showToast(result.error || 'Failed to create event', 'error');
        }
    } catch (err) {
        showToast('Network error while creating event', 'error');
    }
}

// 2. Edit Event
function openEditEventModal(eventId) {
    const event = appState.events.find(e => e.event_id === eventId);
    if (!event) return;

    document.getElementById('edit-event-id').value = event.event_id;
    document.getElementById('edit-event-id-display').value = event.event_id;
    document.getElementById('edit-event-name').value = event.name;
    document.getElementById('edit-event-date').value = event.date;
    document.getElementById('edit-event-venue').value = event.venue;
    document.getElementById('edit-event-max').value = event.max_participants;

    // Refresh min date on edit modal too
    setMinDateOnPickers();
    openModal('modal-edit-event');
}

async function handleEditEventSubmit(e) {
    e.preventDefault();
    const eventId = document.getElementById('edit-event-id').value;
    const name = document.getElementById('edit-event-name').value.trim();
    const date = document.getElementById('edit-event-date').value.trim();
    const venue = document.getElementById('edit-event-venue').value.trim();
    const maxParticipants = parseInt(document.getElementById('edit-event-max').value, 10);

    try {
        const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                date: date,
                venue: venue,
                max_participants: maxParticipants
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast(result.message, 'success');
            closeModal('modal-edit-event');
            await refreshAllData();
            refreshChartsAndAnalysis();
        } else {
            showToast(result.error || 'Failed to update event', 'error');
        }
    } catch (err) {
        showToast('Network error while updating event', 'error');
    }
}

// 3. Delete Event
async function deleteEvent(eventId) {
    if (!confirm(`Are you sure you want to delete event '${eventId}'? This will also remove its registrations and feedback.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
            method: 'DELETE'
        });
        const result = await res.json();
        if (result.success) {
            showToast(result.message, 'success');
            await refreshAllData();
            refreshChartsAndAnalysis();
        } else {
            showToast(result.error || 'Failed to delete event', 'error');
        }
    } catch (err) {
        showToast('Error deleting event', 'error');
    }
}

// 4. Add Student
async function handleAddStudentSubmit(e) {
    e.preventDefault();
    const studentId = document.getElementById('student-id').value.trim();
    const name = document.getElementById('student-name').value.trim();
    const email = document.getElementById('student-email').value.trim();

    try {
        const res = await fetch('/api/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: studentId, name: name, email: email })
        });
        const result = await res.json();
        if (result.success) {
            showToast(result.message, 'success');
            closeModal('modal-add-student');
            document.getElementById('form-add-student').reset();
            await refreshAllData();
        } else {
            showToast(result.error || 'Failed to add student', 'error');
        }
    } catch (err) {
        showToast('Error adding student', 'error');
    }
}

// 5. Edit Student
function openEditStudentModal(studentId) {
    const student = appState.students.find(s => s.student_id === studentId);
    if (!student) return;

    document.getElementById('edit-student-id').value = student.student_id;
    document.getElementById('edit-student-id-display').value = student.student_id;
    document.getElementById('edit-student-name').value = student.name;
    document.getElementById('edit-student-email').value = student.email;

    openModal('modal-edit-student');
}

async function handleEditStudentSubmit(e) {
    e.preventDefault();
    const studentId = document.getElementById('edit-student-id').value;
    const name = document.getElementById('edit-student-name').value.trim();
    const email = document.getElementById('edit-student-email').value.trim();

    try {
        const res = await fetch(`/api/students/${encodeURIComponent(studentId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, email: email })
        });
        const result = await res.json();
        if (result.success) {
            showToast(result.message, 'success');
            closeModal('modal-edit-student');
            await refreshAllData();
        } else {
            showToast(result.error || 'Failed to update student', 'error');
        }
    } catch (err) {
        showToast('Network error while updating student', 'error');
    }
}

// 6. Delete Student
async function deleteStudent(studentId) {
    if (!confirm(`Are you sure you want to remove student '${studentId}'?`)) return;

    try {
        const res = await fetch(`/api/students/${encodeURIComponent(studentId)}`, {
            method: 'DELETE'
        });
        const result = await res.json();
        if (result.success) {
            showToast(result.message, 'success');
            await refreshAllData();
            refreshChartsAndAnalysis();
        } else {
            showToast(result.error || 'Failed to remove student', 'error');
        }
    } catch (err) {
        showToast('Error removing student', 'error');
    }
}

// 6. Registration Handlers
async function handleRegistrationSubmit(e) {
    e.preventDefault();
    const eventId = document.getElementById('reg-select-event').value;
    const studentId = document.getElementById('reg-select-student').value;

    if (!eventId || !studentId) {
        showToast('Please select both an event and a student', 'error');
        return;
    }

    await performRegistration(eventId, studentId);
}

async function handleModalRegisterSubmit(e) {
    e.preventDefault();
    const eventId = document.getElementById('modal-reg-event').value;
    const studentId = document.getElementById('modal-reg-student').value;

    if (!eventId || !studentId) {
        showToast('Please select both an event and a student', 'error');
        return;
    }

    const success = await performRegistration(eventId, studentId);
    if (success) {
        closeModal('modal-register');
    }
}

async function performRegistration(eventId, studentId) {
    try {
        const res = await fetch('/api/registrations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: eventId, student_id: studentId })
        });
        const result = await res.json();
        if (result.success) {
            showToast(result.message, 'success');
            await refreshAllData();
            refreshChartsAndAnalysis();
            return true;
        } else {
            showToast(result.error || 'Registration failed', 'error');
            return false;
        }
    } catch (err) {
        showToast('Error processing registration', 'error');
        return false;
    }
}

async function cancelRegistration(eventId, studentId) {
    if (!confirm(`Are you sure you want to cancel registration for student '${studentId}' on event '${eventId}'?`)) return;

    try {
        const res = await fetch('/api/registrations', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: eventId, student_id: studentId })
        });
        const result = await res.json();
        if (result.success) {
            showToast(result.message, 'success');
            await refreshAllData();
            refreshChartsAndAnalysis();
            // If participant modal is open for this event, refresh it
            if (appState.currentParticipantEventId === eventId) {
                handleParticipantSearch();
            }
        } else {
            showToast(result.error || 'Failed to cancel registration', 'error');
        }
    } catch (err) {
        showToast('Error cancelling registration', 'error');
    }
}

function quickRegisterForEvent(eventId) {
    const modalSelect = document.getElementById('modal-reg-event');
    if (modalSelect) modalSelect.value = eventId;
    updateModalSeatPreview();
    openModal('modal-register');
}

// 7. Feedback Handlers
async function handleFeedbackSubmit(e) {
    e.preventDefault();
    const eventId = document.getElementById('fb-select-event').value;
    const studentId = document.getElementById('fb-select-student').value;
    const rating = parseInt(document.getElementById('fb-rating-value').value, 10);
    const comment = document.getElementById('fb-comment').value.trim();

    if (!eventId || !studentId) {
        showToast('Please select both an event and a registered attendee', 'error');
        return;
    }

    try {
        const res = await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_id: eventId,
                student_id: studentId,
                rating: rating,
                comment: comment
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast(result.message, 'success');
            document.getElementById('fb-comment').value = '';
            await refreshAllData();
            refreshChartsAndAnalysis();
        } else {
            showToast(result.error || 'Failed to record feedback', 'error');
        }
    } catch (err) {
        showToast('Error submitting feedback', 'error');
    }
}

async function handleModalFeedbackSubmit(e) {
    e.preventDefault();
    const eventId = document.getElementById('modal-fb-event').value;
    const studentId = document.getElementById('modal-fb-student').value;
    const rating = parseInt(document.getElementById('modal-fb-rating').value, 10);
    const comment = document.getElementById('modal-fb-comment').value.trim();

    try {
        const res = await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_id: eventId,
                student_id: studentId,
                rating: rating,
                comment: comment
            })
        });
        const result = await res.json();
        if (result.success) {
            showToast(result.message, 'success');
            closeModal('modal-feedback');
            document.getElementById('form-modal-feedback').reset();
            await refreshAllData();
            refreshChartsAndAnalysis();
        } else {
            showToast(result.error || 'Failed to record feedback', 'error');
        }
    } catch (err) {
        showToast('Error submitting feedback', 'error');
    }
}

// 8. Search Registered Students in Modal
async function viewParticipants(eventId, eventName) {
    appState.currentParticipantEventId = eventId;
    document.getElementById('modal-part-event-name').textContent = `Attendees: ${eventName}`;
    document.getElementById('modal-part-event-meta').textContent = `Event ID: ${eventId}`;
    document.getElementById('modal-part-search').value = '';
    openModal('modal-view-participants');
    handleParticipantSearch();
}

async function handleParticipantSearch() {
    const eventId = appState.currentParticipantEventId;
    if (!eventId) return;

    const keyword = document.getElementById('modal-part-search').value.trim();
    const tbody = document.getElementById('modal-part-list');

    try {
        const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/students?keyword=${encodeURIComponent(keyword)}`);
        const students = await res.json();

        if (!students || students.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 1.5rem;">No registered students found matching keyword.</td></tr>`;
            return;
        }

        tbody.innerHTML = students.map(s => `
            <tr>
                <td><strong style="font-family: 'JetBrains Mono'; color: #a5b4fc;">${escapeHtml(s.student_id)}</strong></td>
                <td><strong>${escapeHtml(s.name)}</strong></td>
                <td style="color: var(--text-secondary);">${escapeHtml(s.email)}</td>
                <td class="text-right">
                    <button class="btn btn-sm btn-ghost text-danger" onclick="cancelRegistration('${escapeHtml(eventId)}', '${escapeHtml(s.student_id)}')">
                        Remove
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Error loading registered students.</td></tr>`;
    }
}

// --------------------------------------------------------------------------
// Matplotlib Charts & Analysis
// --------------------------------------------------------------------------
function refreshChartsAndAnalysis() {
    const timestamp = Date.now();
    
    // Refresh images with cache-busting query param
    const chartIds = [
        'chart-img-rating',
        'chart-img-histogram',
        'chart-img-participation',
        'dash-preview-chart'
    ];

    const chartTypes = {
        'chart-img-rating': 'avg_rating_bar',
        'chart-img-histogram': 'rating_histogram',
        'chart-img-participation': 'participation',
        'dash-preview-chart': 'participation'
    };

    chartIds.forEach(id => {
        const img = document.getElementById(id);
        if (img) {
            img.src = `/api/charts/${chartTypes[id]}?t=${timestamp}`;
        }
    });

    fetchAnalysis();
}

function zoomChart(url, title) {
    const zoomImg = document.getElementById('zoom-img');
    const zoomTitle = document.getElementById('zoom-title');
    if (zoomImg) zoomImg.src = `${url}?t=${Date.now()}`;
    if (zoomTitle) zoomTitle.textContent = title;
    openModal('modal-zoom');
}

function downloadChart(chartType) {
    const link = document.createElement('a');
    link.href = `/api/charts/${chartType}?t=${Date.now()}`;
    link.download = `${chartType}_chart.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Downloading high-resolution ${chartType}.png chart`, 'info');
}

// --------------------------------------------------------------------------
// Interactive 5-Star Rating Picker
// --------------------------------------------------------------------------
function initStarRating() {
    const starPicker = document.getElementById('star-picker');
    if (!starPicker) return;

    const stars = starPicker.querySelectorAll('.star-btn');
    const input = document.getElementById('fb-rating-value');
    const label = document.getElementById('rating-label-display');

    const ratingDescriptions = {
        1: "1 Star (Needs Improvement)",
        2: "2 Stars (Fair)",
        3: "3 Stars (Good)",
        4: "4 Stars (Very Good)",
        5: "5 Stars (Outstanding)"
    };

    function updateStars(val) {
        stars.forEach(btn => {
            const btnVal = parseInt(btn.getAttribute('data-value'), 10);
            btn.classList.toggle('active', btnVal <= val);
        });
        if (input) input.value = val;
        if (label) label.textContent = ratingDescriptions[val] || `${val} Stars`;
    }

    stars.forEach(btn => {
        btn.addEventListener('click', () => {
            const val = parseInt(btn.getAttribute('data-value'), 10);
            updateStars(val);
        });

        btn.addEventListener('mouseenter', () => {
            const hoverVal = parseInt(btn.getAttribute('data-value'), 10);
            stars.forEach(b => {
                const bVal = parseInt(b.getAttribute('data-value'), 10);
                b.classList.toggle('hover', bVal <= hoverVal);
            });
        });
    });

    starPicker.addEventListener('mouseleave', () => {
        stars.forEach(b => b.classList.remove('hover'));
    });

    // Default to 5
    updateStars(5);
}

// --------------------------------------------------------------------------
// Modals & Popups
// --------------------------------------------------------------------------
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('open');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open');
}

// Close modals when clicking backdrop
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
        e.target.classList.remove('open');
    }
});

// Close modals on Escape key
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
    }
});

// --------------------------------------------------------------------------
// Toast Alerts
// --------------------------------------------------------------------------
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    if (type === 'success') {
        icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'error') {
        icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    }

    toast.innerHTML = `
        <div style="flex-shrink: 0;">${icon}</div>
        <div style="flex: 1;">${escapeHtml(message)}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4200);
}

// --------------------------------------------------------------------------
// Global Listeners & Seeding
// --------------------------------------------------------------------------
function initGlobalListeners() {
    // Search inputs
    const filterEvents = document.getElementById('filter-events');
    if (filterEvents) filterEvents.addEventListener('input', renderEvents);

    const filterStudents = document.getElementById('filter-students');
    if (filterStudents) filterStudents.addEventListener('input', renderStudents);

    const filterRegistrations = document.getElementById('filter-registrations');
    if (filterRegistrations) filterRegistrations.addEventListener('input', renderRegistrations);

    // Seed Data Button
    const btnSeed = document.getElementById('btn-seed-data');
    if (btnSeed) {
        btnSeed.addEventListener('click', async () => {
            if (!confirm('Load sample campus demo data? This will populate 4 events, 8 students, registrations, and reviews.')) return;
            try {
                const res = await fetch('/api/seed', { method: 'POST' });
                const data = await res.json();
                showToast(data.message, 'success');
                await refreshAllData();
                refreshChartsAndAnalysis();
            } catch (e) {
                showToast('Failed to seed demo data', 'error');
            }
        });
    }

    // Reset Data Button
    const btnReset = document.getElementById('btn-reset-data');
    if (btnReset) {
        btnReset.addEventListener('click', async () => {
            if (!confirm('WARNING: Are you sure you want to clear all data? This will reset all events, students, registrations, and feedback.')) return;
            try {
                const res = await fetch('/api/reset', { method: 'POST' });
                const data = await res.json();
                showToast(data.message, 'info');
                await refreshAllData();
                refreshChartsAndAnalysis();
            } catch (e) {
                showToast('Failed to reset data', 'error');
            }
        });
    }
}

// --------------------------------------------------------------------------
// Utility Helpers
// --------------------------------------------------------------------------
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
