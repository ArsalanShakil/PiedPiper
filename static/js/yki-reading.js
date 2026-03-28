function initYkiReadingView() {
    const setup = document.getElementById('reading-setup');
    const loading = document.getElementById('reading-loading');
    const exam = document.getElementById('reading-exam');
    const results = document.getElementById('reading-results');
    const topicSelect = document.getElementById('reading-topic');
    const startBtn = document.getElementById('reading-start');
    const passagesDiv = document.getElementById('reading-passages');
    const submitBtn = document.getElementById('reading-submit');
    let timer = null;
    let examData = null;
    let sessionId = null;

    if (!setup) return {};

    // Load topics
    (async () => {
        const topics = await Api.get('/api/yki/topics');
        topicSelect.innerHTML = '<option value="">Random</option>' +
            topics.map(t => `<option value="${t}">${t}</option>`).join('');
    })();

    startBtn.addEventListener('click', async () => {
        setup.style.display = 'none';
        loading.style.display = 'block';

        const { ok, data } = await Api.post('/api/yki/generate', {
            exam_type: 'reading',
            topic: topicSelect.value,
        });

        loading.style.display = 'none';

        if (!ok || data.error) {
            alert(data.error || 'Failed to generate exam');
            setup.style.display = 'block';
            return;
        }

        sessionId = data.session_id;
        examData = data.data;
        renderExam();
    });

    function renderExam() {
        exam.style.display = 'block';

        timer = new ExamTimer(
            document.getElementById('reading-timer'),
            3600, null, () => submitExam()
        );
        timer.start();

        const passages = examData.passages || [];
        passagesDiv.innerHTML = passages.map((p, pi) => `
            <div class="passage-block">
                <div class="passage-text">${escapeHtml(p.text)}</div>
                ${(p.questions || []).map((q, qi) => {
                    const qid = `r-${pi}-${qi}`;
                    if (q.type === 'multiple_choice' || q.options) {
                        return `
                            <div class="question-block">
                                <div class="question-text">${pi + 1}.${qi + 1} ${escapeHtml(q.question)}</div>
                                <div class="question-options">
                                    ${(q.options || []).map((opt, oi) => `
                                        <label class="option-label" data-qid="${qid}" data-val="${escapeHtml(opt)}">
                                            <input type="radio" name="${qid}" value="${escapeHtml(opt)}">
                                            <span>${escapeHtml(opt)}</span>
                                        </label>
                                    `).join('')}
                                </div>
                            </div>`;
                    } else {
                        return `
                            <div class="question-block">
                                <div class="question-text">${pi + 1}.${qi + 1} ${escapeHtml(q.question)}</div>
                                <textarea class="answer-textarea" data-qid="${qid}" rows="3" placeholder="Write your answer..."></textarea>
                            </div>`;
                    }
                }).join('')}
            </div>
        `).join('');

        // Selection styling for radio options
        passagesDiv.querySelectorAll('.option-label').forEach(label => {
            label.addEventListener('click', () => {
                const qid = label.dataset.qid;
                passagesDiv.querySelectorAll(`[data-qid="${qid}"]`).forEach(l => l.classList.remove('selected'));
                label.classList.add('selected');
            });
        });
    }

    submitBtn.addEventListener('click', () => submitExam());

    async function submitExam() {
        if (timer) timer.stop();

        // Collect answers
        const answers = [];
        const passages = examData.passages || [];
        passages.forEach((p, pi) => {
            (p.questions || []).forEach((q, qi) => {
                const qid = `r-${pi}-${qi}`;
                const radio = passagesDiv.querySelector(`input[name="${qid}"]:checked`);
                const textarea = passagesDiv.querySelector(`textarea[data-qid="${qid}"]`);
                answers.push({
                    passage: pi,
                    question: qi,
                    answer: radio ? radio.value : (textarea ? textarea.value : ''),
                    correct_answer: q.correct || '',
                });
            });
        });

        exam.style.display = 'none';
        loading.style.display = 'block';
        loading.querySelector('h3').textContent = 'Evaluating answers...';

        const { ok, data } = await Api.post('/api/yki/evaluate', {
            exam_type: 'reading',
            answers,
            exam_data: examData,
        });

        loading.style.display = 'none';
        results.style.display = 'block';

        const score = data.score || 0;
        document.getElementById('reading-score').textContent = score + '%';
        document.getElementById('reading-feedback').textContent = data.feedback || 'No feedback available.';
    }

    return {
        destroy() { if (timer) timer.stop(); }
    };
}
