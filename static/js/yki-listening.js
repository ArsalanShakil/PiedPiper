function initYkiListeningView() {
    const menu = document.getElementById('ls-menu');
    const loading = document.getElementById('ls-loading');
    const exam = document.getElementById('ls-exam');
    const results = document.getElementById('ls-results');
    let timer = null, examData = null, isMock = false;
    let playCounters = {};

    if (!menu) return {};

    // Mode cards
    document.getElementById('ls-start-mock').addEventListener('click', () => {
        document.getElementById('ls-mock-options').style.display = 'block';
        document.getElementById('ls-practice-options').style.display = 'none';
    });
    document.getElementById('ls-start-practice').addEventListener('click', () => {
        document.getElementById('ls-practice-options').style.display = 'block';
        document.getElementById('ls-mock-options').style.display = 'none';
    });

    // Mock start
    document.getElementById('ls-mock-go').addEventListener('click', async () => {
        isMock = true;
        await generateAndStart('/api/listening/generate', {
            category: document.getElementById('ls-mock-category').value, num_clips: 2,
        });
    });

    // Practice random
    document.getElementById('ls-practice-random').addEventListener('click', async () => {
        isMock = false;
        await generateAndStart('/api/listening/generate', {
            category: document.getElementById('ls-practice-category').value, num_clips: 1,
        });
    });

    // Practice browse
    document.getElementById('ls-practice-browse').addEventListener('click', async () => {
        const browser = document.getElementById('ls-passage-browser');
        browser.style.display = 'block';
        browser.innerHTML = '<p style="color:var(--text-light);padding:8px;">Loading...</p>';

        const passages = await Api.get('/api/listening/passages');
        const cat = document.getElementById('ls-practice-category').value;
        const filtered = cat ? passages.filter(p => p.category === cat) : passages;

        const grouped = {};
        filtered.forEach((p, i) => {
            const origIdx = passages.indexOf(p);
            if (!grouped[p.source]) grouped[p.source] = [];
            grouped[p.source].push({ ...p, origIndex: origIdx });
        });

        let html = '';
        for (const [source, items] of Object.entries(grouped)) {
            html += `<div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;padding:8px 0 4px;">${escapeHtml(source)}</div>`;
            items.forEach(p => {
                html += `<div class="sp-browse-item" style="padding:8px 12px;border:1px solid var(--border-light);border-radius:var(--radius-sm);margin-bottom:4px;cursor:pointer;" data-index="${p.origIndex}">
                    <strong style="font-size:13px;">${escapeHtml(p.title)}</strong>
                </div>`;
            });
        }
        browser.innerHTML = html || '<p class="empty-state">No clips found.</p>';

        browser.querySelectorAll('.sp-browse-item').forEach(el => {
            el.addEventListener('click', async () => {
                isMock = false;
                await generateAndStart(`/api/listening/clip/${el.dataset.index}`, {});
            });
        });
    });

    async function generateAndStart(url, body) {
        menu.style.display = 'none';
        loading.style.display = 'block';

        const { ok, data } = await Api.post(url, body);
        loading.style.display = 'none';
        if (!ok || data.error) { alert(data.error || 'Failed'); menu.style.display = 'block'; return; }
        examData = data;
        renderExam();
    }

    function renderExam() {
        exam.style.display = 'block';
        playCounters = {};
        const totalSeconds = isMock ? 2400 : 420; // Mock: 40min, Practice: 7min per clip
        timer = new ExamTimer(document.getElementById('ls-timer'), totalSeconds, null, () => submitExam());
        timer.start();

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
            document.getElementById(`ls-play-${ci}`).addEventListener('click', () => {
                if (isMock && playCounters[ci] >= 2) { alert('No plays remaining.'); return; }
                playCounters[ci]++;
                if (isMock) {
                    document.getElementById(`ls-plays-${ci}`).textContent = `${2 - playCounters[ci]} plays remaining`;
                    if (playCounters[ci] >= 2) document.getElementById(`ls-play-${ci}`).disabled = true;
                }
                new Audio(clip.audio_url).play();
            });
        });

        // Option styling
        div.querySelectorAll('.option-label').forEach(l => {
            l.addEventListener('click', () => {
                div.querySelectorAll(`[data-qid="${l.dataset.qid}"]`).forEach(x => x.classList.remove('selected'));
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
