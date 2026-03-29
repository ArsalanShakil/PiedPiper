function initYkiReadingView() {
    const menu = document.getElementById('rd-menu');
    const loading = document.getElementById('rd-loading');
    const exam = document.getElementById('rd-exam');
    const results = document.getElementById('rd-results');
    let timer = null, examData = null, isMock = false;

    if (!menu) return {};

    // Mode cards
    document.getElementById('rd-start-mock').addEventListener('click', () => {
        document.getElementById('rd-mock-options').style.display = 'block';
        document.getElementById('rd-practice-options').style.display = 'none';
    });
    document.getElementById('rd-start-practice').addEventListener('click', () => {
        document.getElementById('rd-practice-options').style.display = 'block';
        document.getElementById('rd-mock-options').style.display = 'none';
    });

    // Mock start
    document.getElementById('rd-mock-go').addEventListener('click', async () => {
        isMock = true;
        menu.style.display = 'none';
        loading.style.display = 'block';

        const { ok, data } = await Api.post('/api/reading/generate', {
            category: document.getElementById('rd-mock-category').value,
            num_passages: 3,
        });

        loading.style.display = 'none';
        if (!ok || data.error) { alert(data.error || 'Failed'); menu.style.display = 'block'; return; }
        examData = data;
        renderExam();
    });

    // Practice random
    document.getElementById('rd-practice-random').addEventListener('click', async () => {
        isMock = false;
        menu.style.display = 'none';
        loading.style.display = 'block';

        const { ok, data } = await Api.post('/api/reading/generate', {
            category: document.getElementById('rd-practice-category').value,
            num_passages: 1,
        });

        loading.style.display = 'none';
        if (!ok || data.error) { alert(data.error || 'Failed'); menu.style.display = 'block'; return; }
        examData = data;
        renderExam();
    });

    // Practice browse
    document.getElementById('rd-practice-browse').addEventListener('click', async () => {
        const browser = document.getElementById('rd-passage-browser');
        browser.style.display = 'block';
        browser.innerHTML = '<p style="color:var(--text-light);padding:8px;">Loading...</p>';

        const passages = await Api.get('/api/reading/passages');
        const cat = document.getElementById('rd-practice-category').value;
        const filtered = cat ? passages.filter(p => p.category === cat) : passages;

        // Group by source
        const grouped = {};
        filtered.forEach((p, i) => {
            // Need original index for the API
            const origIdx = passages.indexOf(p);
            const key = p.source;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push({ ...p, origIndex: origIdx });
        });

        let html = '';
        for (const [source, items] of Object.entries(grouped)) {
            html += `<div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;padding:8px 0 4px;">${escapeHtml(source)}</div>`;
            items.forEach(p => {
                html += `<div class="sp-browse-item" style="padding:8px 12px;border:1px solid var(--border-light);border-radius:var(--radius-sm);margin-bottom:4px;cursor:pointer;" data-index="${p.origIndex}">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <strong style="font-size:13px;">${escapeHtml(p.title)}</strong>
                        <span style="font-size:11px;color:var(--text-light);">${p.length} chars</span>
                    </div>
                </div>`;
            });
        }
        browser.innerHTML = html || '<p class="empty-state">No passages found.</p>';

        browser.querySelectorAll('.sp-browse-item').forEach(el => {
            el.addEventListener('click', async () => {
                isMock = false;
                menu.style.display = 'none';
                loading.style.display = 'block';

                const { ok, data } = await Api.post(`/api/reading/passage/${el.dataset.index}`, {});
                loading.style.display = 'none';
                if (!ok || data.error) { alert(data.error || 'Failed'); menu.style.display = 'block'; return; }
                examData = data;
                renderExam();
            });
        });
    });

    function renderExam() {
        exam.style.display = 'block';
        // Practice timer based on passage length
        const passageWords = (examData.passages || []).reduce((sum, p) => sum + p.text.split(/\s+/).length, 0);
        const practiceSeconds = Math.max(600, Math.ceil(passageWords / 100) * 120); // ~2min per 100 words, min 10min
        const totalSeconds = isMock ? 3600 : practiceSeconds;
        timer = new ExamTimer(document.getElementById('rd-timer'), totalSeconds, null, () => submitExam());
        timer.start();

        const div = document.getElementById('rd-passages');
        div.innerHTML = (examData.passages || []).map((p, pi) => `
            <div class="passage-block">
                <h3 style="margin-bottom:4px;">${escapeHtml(p.title)}</h3>
                <p style="font-size:11px;color:var(--text-light);margin-bottom:12px;">${escapeHtml(p.source || '')}</p>
                <div class="passage-text">${escapeHtml(p.text)}</div>
                ${(p.questions || []).map((q, qi) => {
                    const qid = `rd-${pi}-${qi}`;
                    if (q.type === 'mc') {
                        return `<div class="question-block">
                            <div class="question-text">${pi+1}.${qi+1} ${escapeHtml(q.question)}</div>
                            <div class="question-options">
                                ${(q.options || []).map(opt => `
                                    <label class="option-label" data-qid="${qid}">
                                        <input type="radio" name="${qid}" value="${escapeHtml(opt)}">
                                        <span>${escapeHtml(opt)}</span>
                                    </label>`).join('')}
                            </div></div>`;
                    } else if (q.type === 'tf') {
                        return `<div class="question-block">
                            <div class="question-text">${pi+1}.${qi+1} ${escapeHtml(q.question)}</div>
                            <div class="question-options">
                                <label class="option-label" data-qid="${qid}"><input type="radio" name="${qid}" value="sant"><span>Sant</span></label>
                                <label class="option-label" data-qid="${qid}"><input type="radio" name="${qid}" value="falskt"><span>Falskt</span></label>
                            </div></div>`;
                    } else {
                        return `<div class="question-block">
                            <div class="question-text">${pi+1}.${qi+1} ${escapeHtml(q.question)}</div>
                            <textarea class="answer-textarea" data-qid="${qid}" rows="3" placeholder="Skriv ditt svar..."></textarea>
                        </div>`;
                    }
                }).join('')}
            </div>`).join('');

        div.querySelectorAll('.option-label').forEach(l => {
            l.addEventListener('click', () => {
                div.querySelectorAll(`[data-qid="${l.dataset.qid}"]`).forEach(x => x.classList.remove('selected'));
                l.classList.add('selected');
            });
        });
    }

    document.getElementById('rd-submit').addEventListener('click', submitExam);

    async function submitExam() {
        if (timer) timer.stop();
        const answers = [];
        const div = document.getElementById('rd-passages');
        (examData.passages || []).forEach((p, pi) => {
            (p.questions || []).forEach((q, qi) => {
                const qid = `rd-${pi}-${qi}`;
                const radio = div.querySelector(`input[name="${qid}"]:checked`);
                const ta = div.querySelector(`textarea[data-qid="${qid}"]`);
                answers.push(radio ? radio.value : (ta ? ta.value : ''));
            });
        });

        exam.style.display = 'none';
        loading.style.display = 'block';
        loading.querySelector('h3').textContent = 'Evaluating...';

        const { ok, data } = await Api.post('/api/reading/evaluate', { answers, passages: examData.passages });
        loading.style.display = 'none';
        results.style.display = 'block';
        const score = data.score || 0;
        document.getElementById('rd-score').textContent = score + '%';
        document.getElementById('rd-feedback').textContent = data.feedback || 'No feedback.';

        // If part of full exam, auto-advance
        if (localStorage.getItem('yki_full_exam_active') === 'reading') {
            setTimeout(() => completeFullExamSection(score), 2000);
        }
    }

    // Auto-start if part of full exam
    if (localStorage.getItem('yki_full_exam_active') === 'reading') {
        isMock = true;
        menu.style.display = 'none';
        loading.style.display = 'block';
        Api.post('/api/reading/generate', { num_passages: 3 }).then(({ ok, data }) => {
            loading.style.display = 'none';
            if (!ok || data.error) { alert(data.error || 'Failed'); menu.style.display = 'block'; return; }
            examData = data;
            renderExam();
        });
    }

    return { destroy() { if (timer) timer.stop(); } };
}
