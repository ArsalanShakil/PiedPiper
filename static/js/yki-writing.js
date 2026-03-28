function initYkiWritingView() {
    const setup = document.getElementById('writing-setup');
    const loading = document.getElementById('writing-loading');
    const exam = document.getElementById('writing-exam');
    const results = document.getElementById('writing-results');
    const topicSelect = document.getElementById('writing-topic');
    const tasksDiv = document.getElementById('writing-tasks');
    let timer = null;
    let examData = null;
    let sessionId = null;

    if (!setup) return {};

    (async () => {
        const topics = await Api.get('/api/yki/topics');
        topicSelect.innerHTML = '<option value="">Random</option>' +
            topics.map(t => `<option value="${t}">${t}</option>`).join('');
    })();

    document.getElementById('writing-start').addEventListener('click', async () => {
        setup.style.display = 'none';
        loading.style.display = 'block';

        const { ok, data } = await Api.post('/api/yki/generate', {
            exam_type: 'writing', topic: topicSelect.value,
        });

        loading.style.display = 'none';
        if (!ok || data.error) { alert(data.error || 'Failed'); setup.style.display = 'block'; return; }

        sessionId = data.session_id;
        examData = data.data;
        renderExam();
    });

    function renderExam() {
        exam.style.display = 'block';
        timer = new ExamTimer(document.getElementById('writing-timer'), 3240, null, () => submitExam());
        timer.start();

        const tasks = examData.tasks || [];
        const badges = { informal: 'badge-informal', formal: 'badge-formal', complaint: 'badge-formal', review: 'badge-formal', argumentative: 'badge-argumentative' };

        tasksDiv.innerHTML = tasks.map((t, i) => `
            <div class="writing-task">
                <div class="task-header">
                    <h3>Task ${i + 1}</h3>
                    <span class="task-type-badge ${badges[t.type] || 'badge-informal'}">${escapeHtml(t.type || 'Task')}</span>
                </div>
                <p style="margin-bottom:16px;line-height:1.6;">${escapeHtml(t.prompt)}</p>
                <p style="font-size:12px;color:var(--text-light);margin-bottom:8px;">Word limit: ~${t.word_limit || 80} words | Time: ${t.time_minutes || 18} min</p>
                <textarea class="answer-textarea writing-answer" data-task="${i}" rows="8" placeholder="Write your answer in Swedish..."></textarea>
                <div class="word-counter" id="wc-${i}">0 words</div>
            </div>
        `).join('');

        // Word counters
        tasksDiv.querySelectorAll('.writing-answer').forEach(ta => {
            ta.addEventListener('input', () => {
                const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
                document.getElementById(`wc-${ta.dataset.task}`).textContent = `${words} words`;
            });
        });
    }

    document.getElementById('writing-submit').addEventListener('click', () => submitExam());

    async function submitExam() {
        if (timer) timer.stop();

        const answers = [];
        tasksDiv.querySelectorAll('.writing-answer').forEach((ta, i) => {
            answers.push({ task: i, text: ta.value.trim(), word_count: ta.value.trim().split(/\s+/).length });
        });

        exam.style.display = 'none';
        loading.style.display = 'block';
        loading.querySelector('h3').textContent = 'Evaluating your writing...';

        const { ok, data } = await Api.post('/api/yki/evaluate', {
            exam_type: 'writing', answers, exam_data: examData,
        });

        loading.style.display = 'none';
        results.style.display = 'block';
        document.getElementById('writing-score').textContent = (data.score || 0) + '%';
        document.getElementById('writing-feedback').textContent = data.feedback || 'No feedback available.';
    }

    return { destroy() { if (timer) timer.stop(); } };
}
