function initYkiReadingView() {
    const menu = document.getElementById('rd-menu');
    const loading = document.getElementById('rd-loading');
    const exam = document.getElementById('rd-exam');
    const results = document.getElementById('rd-results');
    let timer = null, examData = null, isMock = false;

    if (!menu) return {};

    // Load categories
    (async () => {
        const cats = await Api.get('/api/reading/categories');
        const sel = document.getElementById('rd-category');
        sel.innerHTML = '<option value="">All</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
    })();

    document.getElementById('rd-start-mock').addEventListener('click', () => {
        isMock = true;
        document.getElementById('rd-options-title').textContent = 'Mock Test Settings';
        document.getElementById('rd-options').style.display = 'block';
    });
    document.getElementById('rd-start-practice').addEventListener('click', () => {
        isMock = false;
        document.getElementById('rd-options-title').textContent = 'Practice Settings';
        document.getElementById('rd-options').style.display = 'block';
    });

    document.getElementById('rd-go').addEventListener('click', async () => {
        menu.style.display = 'none';
        loading.style.display = 'block';

        const { ok, data } = await Api.post('/api/reading/generate', {
            category: document.getElementById('rd-category').value,
            num_passages: isMock ? 3 : 1,
            mode: isMock ? 'mock' : 'practice',
        });

        loading.style.display = 'none';
        if (!ok || data.error) { alert(data.error || 'Failed'); menu.style.display = 'block'; return; }

        examData = data;
        renderExam();
    });

    function renderExam() {
        exam.style.display = 'block';
        if (isMock) {
            timer = new ExamTimer(document.getElementById('rd-timer'), 3600, null, () => submitExam());
            timer.start();
        } else {
            document.getElementById('rd-timer').textContent = 'Practice';
        }

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

        // Selection styling
        div.querySelectorAll('.option-label').forEach(l => {
            l.addEventListener('click', () => {
                const qid = l.dataset.qid;
                div.querySelectorAll(`[data-qid="${qid}"]`).forEach(x => x.classList.remove('selected'));
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

        const { ok, data } = await Api.post('/api/reading/evaluate', {
            answers, passages: examData.passages,
        });

        loading.style.display = 'none';
        results.style.display = 'block';
        document.getElementById('rd-score').textContent = (data.score || 0) + '%';
        document.getElementById('rd-feedback').textContent = data.feedback || 'No feedback.';
    }

    return { destroy() { if (timer) timer.stop(); } };
}
