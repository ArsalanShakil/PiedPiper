function initYkiHomeView() {
    const historyList = document.getElementById('yki-history-list');
    if (!historyList) return {};

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
