function initYkiWritingView() {
    const menu = document.getElementById('wr-menu');
    const loading = document.getElementById('wr-loading');
    const exam = document.getElementById('wr-exam');
    const results = document.getElementById('wr-results');
    let timer = null, tasks = [], isMock = false;

    if (!menu) return {};

    // Mock test
    document.getElementById('wr-start-mock').addEventListener('click', async () => {
        isMock = true;
        menu.style.display = 'none';
        loading.style.display = 'block';

        const { ok, data } = await Api.post('/api/writing/generate-mock', {});
        loading.style.display = 'none';
        if (!ok || data.error) { alert(data.error || 'Failed'); menu.style.display = 'block'; return; }

        tasks = data.tasks;
        document.getElementById('wr-exam-title').textContent = 'Writing Mock Exam';
        renderExam(data.total_minutes * 60);
    });

    // Practice
    document.getElementById('wr-start-practice').addEventListener('click', () => {
        isMock = false;
        document.getElementById('wr-practice-options').style.display = 'block';
    });

    document.getElementById('wr-practice-random').addEventListener('click', async () => {
        const type = document.getElementById('wr-type').value;
        menu.style.display = 'none';
        loading.style.display = 'block';

        const { ok, data } = await Api.post('/api/writing/generate-practice', { type });
        loading.style.display = 'none';
        if (!ok || data.error) { alert(data.error || 'Failed'); menu.style.display = 'block'; return; }

        tasks = [data];
        document.getElementById('wr-exam-title').textContent = `Practice — ${data.label}`;
        renderExam(data.time_minutes * 60);
    });

    // Browse prompts
    document.getElementById('wr-practice-browse').addEventListener('click', async () => {
        const browser = document.getElementById('wr-prompt-browser');
        browser.style.display = 'block';
        browser.innerHTML = '<p style="color:var(--text-light);padding:8px;">Loading...</p>';

        const prompts = await Api.get('/api/writing/prompts');
        const typeFilter = document.getElementById('wr-type').value;
        const labels = { informal: 'Informellt mejl', complaint: 'Klagomål', review: 'Recension', argumentative: 'Argumenterande' };

        let html = '';
        for (const [cat, items] of Object.entries(prompts)) {
            if (typeFilter && cat !== typeFilter) continue;
            if (!items.length) continue;
            html += `<div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;padding:6px 0;">${labels[cat] || cat}</div>`;
            items.forEach(p => {
                html += `<div class="sp-browse-item" style="padding:8px 12px;border:1px solid var(--border-light);border-radius:var(--radius-sm);margin-bottom:4px;cursor:pointer;" data-type="${cat}" data-index="${p.index}">
                    <strong style="font-size:13px;">${escapeHtml(p.title)}</strong>
                </div>`;
            });
        }
        browser.innerHTML = html || '<p class="empty-state">No prompts found.</p>';

        browser.querySelectorAll('.sp-browse-item').forEach(el => {
            el.addEventListener('click', async () => {
                menu.style.display = 'none';
                loading.style.display = 'block';
                const { ok, data } = await Api.post('/api/writing/generate-practice', {
                    type: el.dataset.type, index: parseInt(el.dataset.index),
                });
                loading.style.display = 'none';
                if (!ok || data.error) { alert(data.error || 'Failed'); menu.style.display = 'block'; return; }
                tasks = [data];
                document.getElementById('wr-exam-title').textContent = `Practice — ${data.label}`;
                renderExam(data.time_minutes * 60);
            });
        });
    });

    function renderExam(totalSeconds) {
        exam.style.display = 'block';
        timer = new ExamTimer(document.getElementById('wr-timer'), totalSeconds, null, () => submitExam());
        timer.start();

        const badges = { informal: 'badge-informal', complaint: 'badge-formal', review: 'badge-formal', argumentative: 'badge-argumentative' };
        const div = document.getElementById('wr-tasks');
        div.innerHTML = tasks.map((t, i) => `
            <div class="writing-task">
                <div class="task-header">
                    <h3>Task ${i + 1}</h3>
                    <span class="task-type-badge ${badges[t.type] || ''}">${escapeHtml(t.label)}</span>
                </div>
                <p style="margin-bottom:12px;line-height:1.6;font-size:15px;">${escapeHtml(t.prompt)}</p>
                <p style="font-size:12px;color:var(--text-light);margin-bottom:8px;">Word limit: ~${t.word_limit} words | Time: ${t.time_minutes} min</p>
                ${t.template ? `<details style="margin-bottom:12px;"><summary style="font-size:12px;color:var(--primary);cursor:pointer;">Show example template</summary><pre style="font-size:12px;background:var(--bg);padding:12px;border-radius:var(--radius-sm);white-space:pre-wrap;margin-top:8px;">${escapeHtml(t.template)}</pre></details>` : ''}
                <textarea class="answer-textarea writing-answer" data-task="${i}" rows="10" placeholder="Skriv ditt svar på svenska..."></textarea>
                <div class="word-counter" id="wr-wc-${i}">0 words</div>
            </div>
        `).join('');

        div.querySelectorAll('.writing-answer').forEach(ta => {
            ta.addEventListener('input', () => {
                const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
                document.getElementById(`wr-wc-${ta.dataset.task}`).textContent = `${words} words`;
            });
        });
    }

    document.getElementById('wr-submit').addEventListener('click', submitExam);

    async function submitExam() {
        if (timer) timer.stop();

        const answers = [];
        document.querySelectorAll('.writing-answer').forEach(ta => answers.push(ta.value.trim()));

        exam.style.display = 'none';
        loading.style.display = 'block';
        loading.querySelector('h3').textContent = 'Evaluating your writing...';

        const { ok, data } = await Api.post('/api/writing/evaluate', { tasks, answers });

        loading.style.display = 'none';
        results.style.display = 'block';
        document.getElementById('wr-score').textContent = (data.score || 0) + '%';

        let fb = data.feedback || '';
        if (data.task_feedback) {
            data.task_feedback.forEach((tf, i) => {
                fb += `\n\nTask ${i + 1} (${tf.score || 0}%): ${tf.feedback || ''}`;
            });
        }
        document.getElementById('wr-feedback').textContent = fb;
    }

    return { destroy() { if (timer) timer.stop(); } };
}
