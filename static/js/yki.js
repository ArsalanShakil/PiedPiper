function initYkiHomeView() {
    const historyList = document.getElementById('yki-history-list');
    const fullExamCard = document.getElementById('yki-full-exam-card');
    const fullConfirm = document.getElementById('yki-full-confirm');
    const fullProgress = document.getElementById('yki-full-progress');

    if (!historyList) return {};

    // Load history
    (async () => {
        const sessions = await Api.get('/api/yki/sessions');
        if (sessions.length === 0) {
            historyList.innerHTML = '<p class="empty-state">No exams taken yet.</p>';
            return;
        }
        historyList.innerHTML = sessions.map(s => `
            <div class="file-item">
                <div class="file-info">
                    <span class="file-name">${s.exam_type.charAt(0).toUpperCase() + s.exam_type.slice(1)} Exam</span>
                    <span class="file-meta">
                        <span class="badge">${escapeHtml(s.topic || 'General')}</span>
                        <span class="badge">${s.status}</span>
                        <span>${formatDate(s.started_at)}</span>
                        ${s.total_score !== null ? `<span>${s.total_score}%</span>` : ''}
                    </span>
                </div>
            </div>
        `).join('');
    })();

    // Check if full exam is in progress
    const fullExamState = JSON.parse(localStorage.getItem('yki_full_exam') || 'null');
    if (fullExamState && fullExamState.currentSection < fullExamState.sections.length) {
        showFullExamProgress(fullExamState);
    }

    // Full exam flow
    fullExamCard.addEventListener('click', () => {
        fullConfirm.style.display = 'block';
    });

    document.getElementById('yki-full-cancel').addEventListener('click', () => {
        fullConfirm.style.display = 'none';
    });

    document.getElementById('yki-full-start').addEventListener('click', () => {
        const state = {
            started: new Date().toISOString(),
            currentSection: 0,
            sections: [
                { type: 'reading', label: 'Reading', icon: '\uD83D\uDCD6', time: '60 min', status: 'pending', route: '#/yki/reading' },
                { type: 'listening', label: 'Listening', icon: '\uD83C\uDFA7', time: '40 min', status: 'pending', route: '#/yki/listening' },
                { type: 'writing', label: 'Writing', icon: '\uD83D\uDCDD', time: '54 min', status: 'pending', route: '#/yki/writing' },
                { type: 'speaking', label: 'Speaking', icon: '\uD83C\uDFA4', time: '25 min', status: 'pending', route: '#/yki/speaking' },
            ],
            scores: {},
        };
        localStorage.setItem('yki_full_exam', JSON.stringify(state));
        fullConfirm.style.display = 'none';
        showFullExamProgress(state);
    });

    function showFullExamProgress(state) {
        fullProgress.style.display = 'block';
        fullExamCard.style.display = 'none';

        const sectionsDiv = document.getElementById('yki-full-sections');
        sectionsDiv.innerHTML = state.sections.map((s, i) => {
            let statusBadge = '';
            let rowStyle = '';
            if (i < state.currentSection) {
                statusBadge = '<span class="badge" style="background:#f0fdf4;color:var(--success);">Done</span>';
                rowStyle = 'opacity:0.6;';
            } else if (i === state.currentSection) {
                statusBadge = '<span class="badge" style="background:var(--primary-light);color:var(--primary);">Up next</span>';
                rowStyle = 'border-left:3px solid var(--primary);padding-left:13px;';
            } else {
                statusBadge = '<span class="badge">Pending</span>';
                rowStyle = 'opacity:0.4;';
            }

            const score = state.scores[s.type] !== undefined ? ` — ${state.scores[s.type]}%` : '';

            return `<div style="padding:12px 16px;border:1px solid var(--border-light);border-radius:var(--radius-sm);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;${rowStyle}">
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:20px;">${s.icon}</span>
                    <div>
                        <strong>${i + 1}. ${s.label}</strong>
                        <span style="font-size:12px;color:var(--text-light);margin-left:8px;">${s.time}${score}</span>
                    </div>
                </div>
                ${statusBadge}
            </div>`;
        }).join('');

        const nextBtn = document.getElementById('yki-full-next');
        if (state.currentSection >= state.sections.length) {
            // All done
            nextBtn.textContent = 'Exam Complete! View Results';
            nextBtn.onclick = () => {
                localStorage.removeItem('yki_full_exam');
                fullProgress.style.display = 'none';
                fullExamCard.style.display = 'block';
                // Show summary
                const totalScore = Object.values(state.scores);
                const avg = totalScore.length > 0 ? Math.round(totalScore.reduce((a, b) => a + b, 0) / totalScore.length) : 0;
                alert(`Full Exam Complete!\n\nAverage Score: ${avg}%\n\n` +
                    state.sections.map(s => `${s.label}: ${state.scores[s.type] !== undefined ? state.scores[s.type] + '%' : 'N/A'}`).join('\n'));
            };
        } else {
            const next = state.sections[state.currentSection];
            nextBtn.textContent = `Start ${next.label} (${next.time})`;
            nextBtn.onclick = () => {
                // Mark as in progress and navigate
                state.sections[state.currentSection].status = 'in_progress';
                localStorage.setItem('yki_full_exam', JSON.stringify(state));
                // Set a flag so the section knows it's part of a full exam
                localStorage.setItem('yki_full_exam_active', next.type);
                location.hash = next.route;
            };
        }

        // Add abort button
        if (state.currentSection < state.sections.length) {
            if (!document.getElementById('yki-full-abort')) {
                const abortBtn = document.createElement('button');
                abortBtn.id = 'yki-full-abort';
                abortBtn.className = 'btn btn-danger';
                abortBtn.style.marginTop = '8px';
                abortBtn.style.width = '100%';
                abortBtn.textContent = 'Abort Full Exam';
                abortBtn.onclick = () => {
                    if (confirm('Abort the full exam? Progress will be lost.')) {
                        localStorage.removeItem('yki_full_exam');
                        localStorage.removeItem('yki_full_exam_active');
                        fullProgress.style.display = 'none';
                        fullExamCard.style.display = 'block';
                    }
                };
                fullProgress.appendChild(abortBtn);
            }
        }
    }

    return { destroy() {} };
}

// Shared helper to speak text via Piper TTS and return audio URL
async function ttsSpeak(text) {
    const voices = await Api.get('/api/voices');
    if (voices.length === 0) return null;
    const { ok, data } = await Api.post('/api/synthesize', {
        text, voice_id: voices[0].id, format: 'wav', save_path: '', filename: '',
    });
    if (!ok) return null;
    return `/api/files/play?folder=${encodeURIComponent(data.folder)}&name=${encodeURIComponent(data.filename)}`;
}

// Called by individual exam sections when they complete (in full exam mode)
function completeFullExamSection(score) {
    const state = JSON.parse(localStorage.getItem('yki_full_exam') || 'null');
    if (!state) return;

    const activeType = localStorage.getItem('yki_full_exam_active');
    if (!activeType) return;

    // Record score and advance
    state.scores[activeType] = score || 0;
    state.sections[state.currentSection].status = 'done';
    state.currentSection++;
    localStorage.setItem('yki_full_exam', JSON.stringify(state));
    localStorage.removeItem('yki_full_exam_active');

    // Navigate back to dashboard
    location.hash = '#/yki';
}
