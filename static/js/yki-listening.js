function initYkiListeningView() {
    const menu = document.getElementById('ls-menu');
    const loading = document.getElementById('ls-loading');
    const exam = document.getElementById('ls-exam');
    const results = document.getElementById('ls-results');
    let timer = null, examData = null, isMock = false;
    let playCounters = {};

    if (!menu) return {};

    (async () => {
        const cats = await Api.get('/api/listening/categories');
        document.getElementById('ls-category').innerHTML = '<option value="">All</option>' +
            cats.map(c => `<option value="${c}">${c}</option>`).join('');
    })();

    document.getElementById('ls-start-mock').addEventListener('click', () => {
        isMock = true;
        document.getElementById('ls-options-title').textContent = 'Mock Test';
        document.getElementById('ls-options').style.display = 'block';
    });
    document.getElementById('ls-start-practice').addEventListener('click', () => {
        isMock = false;
        document.getElementById('ls-options-title').textContent = 'Practice';
        document.getElementById('ls-options').style.display = 'block';
    });

    document.getElementById('ls-go').addEventListener('click', async () => {
        menu.style.display = 'none';
        loading.style.display = 'block';

        const { ok, data } = await Api.post('/api/listening/generate', {
            category: document.getElementById('ls-category').value,
            num_clips: isMock ? 2 : 1,
        });

        loading.style.display = 'none';
        if (!ok || data.error) { alert(data.error || 'Failed'); menu.style.display = 'block'; return; }
        examData = data;
        renderExam();
    });

    function renderExam() {
        exam.style.display = 'block';
        if (isMock) {
            timer = new ExamTimer(document.getElementById('ls-timer'), 2400, null, () => submitExam());
            timer.start();
        } else {
            document.getElementById('ls-timer').textContent = 'Practice';
        }

        const div = document.getElementById('ls-clips');
        div.innerHTML = (examData.clips || []).map((clip, ci) => {
            playCounters[ci] = 0;
            return `
            <div class="passage-block">
                <h3 style="margin-bottom:12px;">${escapeHtml(clip.title)}</h3>
                <div class="audio-player-block">
                    <button class="btn" id="ls-play-${ci}">Play Audio</button>
                    <span class="plays-remaining" id="ls-plays-${ci}">${isMock ? '2 plays remaining' : 'Unlimited plays'}</span>
                </div>
                ${(clip.questions || []).map((q, qi) => {
                    const qid = `ls-${ci}-${qi}`;
                    if (q.type === 'mc') {
                        return `<div class="question-block">
                            <div class="question-text">${ci+1}.${qi+1} ${escapeHtml(q.question)}</div>
                            <div class="question-options">
                                ${(q.options || []).map(opt => `
                                    <label class="option-label" data-qid="${qid}">
                                        <input type="radio" name="${qid}" value="${escapeHtml(opt)}">
                                        <span>${escapeHtml(opt)}</span>
                                    </label>`).join('')}
                            </div></div>`;
                    } else if (q.type === 'tf') {
                        return `<div class="question-block">
                            <div class="question-text">${ci+1}.${qi+1} ${escapeHtml(q.question)}</div>
                            <div class="question-options">
                                <label class="option-label" data-qid="${qid}"><input type="radio" name="${qid}" value="sant"><span>Sant</span></label>
                                <label class="option-label" data-qid="${qid}"><input type="radio" name="${qid}" value="falskt"><span>Falskt</span></label>
                            </div></div>`;
                    } else {
                        return `<div class="question-block">
                            <div class="question-text">${ci+1}.${qi+1} ${escapeHtml(q.question)}</div>
                            <textarea class="answer-textarea" data-qid="${qid}" rows="2" placeholder="Skriv ditt svar..."></textarea>
                        </div>`;
                    }
                }).join('')}
            </div>`;
        }).join('');

        // Play buttons
        (examData.clips || []).forEach((clip, ci) => {
            const btn = document.getElementById(`ls-play-${ci}`);
            const playsSpan = document.getElementById(`ls-plays-${ci}`);
            btn.addEventListener('click', () => {
                if (isMock && playCounters[ci] >= 2) { alert('No plays remaining.'); return; }
                playCounters[ci]++;
                if (isMock) {
                    playsSpan.textContent = `${2 - playCounters[ci]} plays remaining`;
                    if (playCounters[ci] >= 2) btn.disabled = true;
                }
                const audio = new Audio(clip.audio_url);
                audio.play();
            });
        });

        // Option selection styling
        div.querySelectorAll('.option-label').forEach(l => {
            l.addEventListener('click', () => {
                const qid = l.dataset.qid;
                div.querySelectorAll(`[data-qid="${qid}"]`).forEach(x => x.classList.remove('selected'));
                l.classList.add('selected');
            });
        });
    }

    document.getElementById('ls-submit').addEventListener('click', submitExam);

    async function submitExam() {
        if (timer) timer.stop();

        const answers = [];
        const div = document.getElementById('ls-clips');
        (examData.clips || []).forEach((clip, ci) => {
            (clip.questions || []).forEach((q, qi) => {
                const qid = `ls-${ci}-${qi}`;
                const radio = div.querySelector(`input[name="${qid}"]:checked`);
                const ta = div.querySelector(`textarea[data-qid="${qid}"]`);
                answers.push(radio ? radio.value : (ta ? ta.value : ''));
            });
        });

        exam.style.display = 'none';
        loading.style.display = 'block';
        loading.querySelector('h3').textContent = 'Evaluating...';
        loading.querySelector('p').textContent = '';

        const { ok, data } = await Api.post('/api/listening/evaluate', { answers, clips: examData.clips });

        loading.style.display = 'none';
        results.style.display = 'block';
        document.getElementById('ls-score').textContent = (data.score || 0) + '%';
        document.getElementById('ls-feedback').textContent = data.feedback || 'No feedback.';
    }

    return { destroy() { if (timer) timer.stop(); } };
}
