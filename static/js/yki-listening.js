function initYkiListeningView() {
    const setup = document.getElementById('listening-setup');
    const loading = document.getElementById('listening-loading');
    const exam = document.getElementById('listening-exam');
    const results = document.getElementById('listening-results');
    const topicSelect = document.getElementById('listening-topic');
    const clipsDiv = document.getElementById('listening-clips');
    let timer = null;
    let examData = null;
    let sessionId = null;
    let playCounters = {};

    if (!setup) return {};

    (async () => {
        const topics = await Api.get('/api/yki/topics');
        topicSelect.innerHTML = '<option value="">Random</option>' +
            topics.map(t => `<option value="${t}">${t}</option>`).join('');
    })();

    document.getElementById('listening-start').addEventListener('click', async () => {
        setup.style.display = 'none';
        loading.style.display = 'block';

        // Generate exam content
        const { ok, data } = await Api.post('/api/yki/generate', {
            exam_type: 'listening', topic: topicSelect.value,
        });

        if (!ok || data.error) { alert(data.error || 'Failed'); loading.style.display = 'none'; setup.style.display = 'block'; return; }

        sessionId = data.session_id;
        examData = data.data;

        // Synthesize audio for each clip
        loading.querySelector('p').textContent = 'Synthesizing audio...';
        const clips = examData.clips || [];
        for (let i = 0; i < clips.length; i++) {
            const { ok: aOk, data: aData } = await Api.post('/api/yki/synthesize-script', {
                text: clips[i].script,
            });
            if (aOk) {
                clips[i].audio_url = `/api/yki/audio-cache/play?path=${encodeURIComponent(aData.audio_path)}`;
            }
        }

        loading.style.display = 'none';
        renderExam();
    });

    function renderExam() {
        exam.style.display = 'block';
        timer = new ExamTimer(document.getElementById('listening-timer'), 2400, null, () => submitExam());
        timer.start();

        const clips = examData.clips || [];
        clipsDiv.innerHTML = clips.map((clip, ci) => {
            playCounters[ci] = 0;
            return `
            <div class="passage-block">
                <h3 style="margin-bottom:12px;">${escapeHtml(clip.title || `Clip ${ci + 1}`)}</h3>
                <div class="audio-player-block">
                    <button class="btn" id="play-clip-${ci}">Play Audio</button>
                    <span class="plays-remaining" id="plays-${ci}">2 plays remaining</span>
                </div>
                ${(clip.questions || []).map((q, qi) => {
                    const qid = `l-${ci}-${qi}`;
                    if (q.options) {
                        return `
                            <div class="question-block">
                                <div class="question-text">${ci + 1}.${qi + 1} ${escapeHtml(q.question)}</div>
                                <div class="question-options">
                                    ${q.options.map(opt => `
                                        <label class="option-label" data-qid="${qid}">
                                            <input type="radio" name="${qid}" value="${escapeHtml(opt)}">
                                            <span>${escapeHtml(opt)}</span>
                                        </label>
                                    `).join('')}
                                </div>
                            </div>`;
                    }
                    return `
                        <div class="question-block">
                            <div class="question-text">${ci + 1}.${qi + 1} ${escapeHtml(q.question)}</div>
                            <textarea class="answer-textarea" data-qid="${qid}" rows="2" placeholder="Your answer..."></textarea>
                        </div>`;
                }).join('')}
            </div>`;
        }).join('');

        // Play buttons (max 2 plays each)
        clips.forEach((clip, ci) => {
            const playBtn = document.getElementById(`play-clip-${ci}`);
            const playsSpan = document.getElementById(`plays-${ci}`);
            playBtn.addEventListener('click', () => {
                if (playCounters[ci] >= 2) { alert('No plays remaining for this clip.'); return; }
                playCounters[ci]++;
                playsSpan.textContent = `${2 - playCounters[ci]} plays remaining`;
                if (playCounters[ci] >= 2) playBtn.disabled = true;
                const audio = new Audio(clip.audio_url);
                audio.play();
            });
        });

        // Option selection styling
        clipsDiv.querySelectorAll('.option-label').forEach(label => {
            label.addEventListener('click', () => {
                const qid = label.dataset.qid;
                clipsDiv.querySelectorAll(`[data-qid="${qid}"]`).forEach(l => l.classList.remove('selected'));
                label.classList.add('selected');
            });
        });
    }

    document.getElementById('listening-submit').addEventListener('click', () => submitExam());

    async function submitExam() {
        if (timer) timer.stop();

        const answers = [];
        const clips = examData.clips || [];
        clips.forEach((clip, ci) => {
            (clip.questions || []).forEach((q, qi) => {
                const qid = `l-${ci}-${qi}`;
                const radio = clipsDiv.querySelector(`input[name="${qid}"]:checked`);
                const textarea = clipsDiv.querySelector(`textarea[data-qid="${qid}"]`);
                answers.push({
                    clip: ci, question: qi,
                    answer: radio ? radio.value : (textarea ? textarea.value : ''),
                    correct_answer: q.correct || '',
                });
            });
        });

        exam.style.display = 'none';
        loading.style.display = 'block';
        loading.querySelector('h3').textContent = 'Evaluating answers...';
        loading.querySelector('p').textContent = '';

        const { ok, data } = await Api.post('/api/yki/evaluate', {
            exam_type: 'listening', answers, exam_data: examData,
        });

        loading.style.display = 'none';
        results.style.display = 'block';
        document.getElementById('listening-score').textContent = (data.score || 0) + '%';
        document.getElementById('listening-feedback').textContent = data.feedback || 'No feedback available.';
    }

    return { destroy() { if (timer) timer.stop(); } };
}
