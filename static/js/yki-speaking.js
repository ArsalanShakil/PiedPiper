function initYkiSpeakingView() {
    const menu = document.getElementById('sp-menu');
    const loading = document.getElementById('sp-loading');
    const examDiv = document.getElementById('sp-exam');
    const results = document.getElementById('sp-results');
    const currentPartDiv = document.getElementById('sp-current-part');
    const timerEl = document.getElementById('sp-timer');
    const partLabel = document.getElementById('sp-part-label');

    if (!menu) return {};

    let testData = null;
    let currentPartIndex = 0;
    let timer = null;
    let recorder = null;
    let recognition = null;
    let allResponses = [];
    let isMockMode = false;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    // --- Load options ---
    (async () => {
        const tests = await Api.get('/api/speaking/tests');
        const sel = document.getElementById('sp-test-select');
        sel.innerHTML = tests.map(t => `<option value="${t.number}">Prov ${t.number} — ${t.topic}</option>`).join('');

        const topics = await Api.get('/api/speaking/topics');
        const topicSel = document.getElementById('sp-topic-select');
        topicSel.innerHTML = '<option value="">Random</option>' +
            topics.map(t => `<option value="${t}">${t}</option>`).join('');
    })();

    // --- Mode buttons ---
    document.getElementById('sp-start-mock').addEventListener('click', () => {
        document.getElementById('sp-mock-options').style.display = 'block';
        document.getElementById('sp-practice-options').style.display = 'none';
    });

    document.getElementById('sp-start-practice').addEventListener('click', () => {
        document.getElementById('sp-practice-options').style.display = 'block';
        document.getElementById('sp-mock-options').style.display = 'none';
    });

    // --- Start Mock Test ---
    document.getElementById('sp-mock-go').addEventListener('click', async () => {
        const testNum = document.getElementById('sp-test-select').value;
        menu.style.display = 'none';
        loading.style.display = 'block';

        const data = await Api.get(`/api/speaking/test/${testNum}`);
        if (data.error) { alert(data.error); loading.style.display = 'none'; menu.style.display = 'block'; return; }

        isMockMode = true;
        testData = data;
        currentPartIndex = 0;
        allResponses = [];
        document.getElementById('sp-exam-title').textContent = `Prov ${data.number} — ${data.topic}`;

        loading.style.display = 'none';
        examDiv.style.display = 'block';
        runPart();
    });

    // --- Start Practice ---
    document.getElementById('sp-practice-go').addEventListener('click', async () => {
        const partType = document.getElementById('sp-part-type').value;
        const topic = document.getElementById('sp-topic-select').value;
        menu.style.display = 'none';
        loading.style.display = 'block';

        const url = `/api/speaking/practice?type=${encodeURIComponent(partType)}&topic=${encodeURIComponent(topic)}`;
        const data = await Api.get(url);
        if (data.error) { alert(data.error); loading.style.display = 'none'; menu.style.display = 'block'; return; }

        isMockMode = false;
        testData = { number: 0, topic: data.test_topic || 'Practice', parts: [data] };
        currentPartIndex = 0;
        allResponses = [];
        document.getElementById('sp-exam-title').textContent = `Practice — ${data.title}`;

        loading.style.display = 'none';
        examDiv.style.display = 'block';
        runPart();
    });

    // --- Next Part ---
    document.getElementById('sp-next-part').addEventListener('click', () => {
        stopAll();
        currentPartIndex++;
        if (currentPartIndex < testData.parts.length) {
            runPart();
        } else {
            showResults();
        }
    });

    document.getElementById('sp-back-menu').addEventListener('click', () => {
        stopAll();
        examDiv.style.display = 'none';
        menu.style.display = 'block';
    });

    // --- Run a Part ---
    async function runPart() {
        const part = testData.parts[currentPartIndex];
        partLabel.textContent = `Del ${part.part}: ${part.title}`;

        if (part.type === 'dialogues') {
            await runDialogues(part);
        } else if (part.type === 'react') {
            await runReact(part);
        } else if (part.type === 'narrate' || part.type === 'opinion') {
            await runNarrateOrOpinion(part);
        }
    }

    // --- DIALOGUES ---
    async function runDialogues(part) {
        const dialogues = part.items || [];
        let html = `<div class="speaking-part">
            <h3>${part.title}</h3>
            <p style="color:var(--text-dim);margin-bottom:16px;">${part.instructions}</p>`;

        for (let di = 0; di < dialogues.length; di++) {
            const d = dialogues[di];
            html += `<div style="margin-bottom:24px;padding:16px;background:var(--bg);border-radius:var(--radius-sm);">
                <h4 style="margin-bottom:4px;">${escapeHtml(d.title)}</h4>
                <p style="font-size:13px;color:var(--text-dim);margin-bottom:12px;">${escapeHtml(d.situation)}</p>`;

            for (let li = 0; li < d.lines.length; li++) {
                const line = d.lines[li];
                const id = `dialog-${di}-${li}`;
                html += `
                <div class="dialog-exchange" style="margin-bottom:12px;padding:12px;border:1px solid var(--border-light);border-radius:8px;">
                    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
                        <p style="flex:1;font-size:14px;"><strong>Prompt:</strong> ${escapeHtml(line.prompt)}</p>
                        <button class="btn btn-small" onclick="spPlayPrompt(this, \`${line.prompt.replace(/`/g, "'")}\`)">Listen</button>
                    </div>
                    <p style="font-size:12px;color:var(--text-light);margin-bottom:8px;"><em>${escapeHtml(line.instruction)}</em></p>
                    ${recControlsHtml(id, part.answer_seconds)}
                </div>`;
            }
            html += '</div>';
        }
        html += '</div>';
        currentPartDiv.innerHTML = html;
    }

    // --- REACT ---
    async function runReact(part) {
        const items = part.items || [];
        let html = `<div class="speaking-part">
            <h3>${part.title}</h3>
            <p style="color:var(--text-dim);margin-bottom:16px;">${part.instructions}</p>`;

        items.forEach((item, i) => {
            const id = `react-${i}`;
            html += `
            <div style="margin-bottom:16px;padding:16px;background:var(--bg);border-radius:var(--radius-sm);">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
                    <p style="flex:1;"><strong>${i + 1}.</strong> ${escapeHtml(item.situation)}</p>
                    <button class="btn btn-small" onclick="spPlayPrompt(this, \`${item.situation.replace(/`/g, "'")}\`)">Listen</button>
                </div>
                <p style="font-size:12px;color:var(--text-light);margin-bottom:8px;"><em>${escapeHtml(item.instruction)}</em></p>
                <div class="recording-controls">
                    <button class="rec-btn" id="rec-${id}" onclick="spToggleRec('${id}', ${part.answer_seconds})"><div class="rec-dot"></div></button>
                    <span class="recording-status" id="status-${id}">Press to record</span>
                    <span class="exam-timer" id="timer-${id}" style="font-size:14px;padding:4px 8px;display:none;">00:${part.answer_seconds}</span>
                    <audio id="play-${id}" controls style="display:none;height:32px;"></audio>
                </div>
                <div class="transcript-box" id="transcript-${id}">Your answer will appear here...</div>
            </div>`;
        });

        html += '</div>';
        currentPartDiv.innerHTML = html;
    }

    // --- NARRATE / OPINION ---
    async function runNarrateOrOpinion(part) {
        const id = `narrate-0`;
        const prompts = part.prompts || [];

        let html = `<div class="speaking-part">
            <h3>${escapeHtml(part.title)}: ${escapeHtml(part.topic || '')}</h3>
            <p style="color:var(--text-dim);margin-bottom:16px;">${part.instructions}</p>
            <div class="speaking-prompt">`;

        if (prompts.length > 0) {
            html += '<ul style="margin:0;padding-left:20px;">';
            prompts.forEach(p => { html += `<li style="margin-bottom:4px;">${escapeHtml(p)}</li>`; });
            html += '</ul>';
        }

        html += `
                <div style="margin-top:12px;">
                    <button class="btn btn-small" onclick="spPlayPrompt(this, \`${(part.topic + '. ' + prompts.join('. ')).replace(/`/g, "'")}\`)">Listen to topic</button>
                </div>
            </div>
            <div style="margin-top:12px;padding:12px;background:var(--primary-light);border-radius:var(--radius-sm);font-size:13px;color:var(--primary);">
                Prep time: ${part.prep_seconds}s | Speaking time: ${part.answer_seconds}s
            </div>
            <div style="margin-top:16px;">
                ${recControlsHtml(id, part.answer_seconds)}
            </div>
        </div>`;

        currentPartDiv.innerHTML = html;
    }

    // Helper: generate recording controls HTML for an exercise
    function recControlsHtml(id, answerSeconds) {
        return `
            <div class="recording-controls">
                <button class="rec-btn" id="rec-${id}" onclick="spToggleRec('${id}', ${answerSeconds})"><div class="rec-dot"></div></button>
                <span class="recording-status" id="status-${id}">Press to record</span>
                <span class="exam-timer" id="timer-${id}" style="font-size:14px;padding:4px 8px;display:none;">00:${answerSeconds}</span>
                ${!isMockMode ? `<button class="btn btn-small" id="reset-${id}" style="display:none;" onclick="spResetRec('${id}', ${answerSeconds})">Reset</button>` : ''}
                <audio id="play-${id}" controls style="display:none;height:32px;"></audio>
            </div>
            <div class="transcript-box" id="transcript-${id}">Your answer will appear here...</div>`;
    }

    // --- Play prompt via TTS (repeat twice) ---
    window.spPlayPrompt = async function(btn, text) {
        btn.disabled = true;
        btn.textContent = 'Speaking...';

        const { ok, data } = await Api.post('/api/speaking/tts', { text });
        if (!ok) { btn.disabled = false; btn.textContent = 'Listen'; return; }

        const audio = new Audio(data.url);
        // Play twice
        let playCount = 0;
        audio.addEventListener('ended', () => {
            playCount++;
            if (playCount < 2) {
                setTimeout(() => audio.play(), 800);
            } else {
                btn.disabled = false;
                btn.textContent = 'Listen again';
            }
        });
        audio.play();
    };

    // --- Recording with timer + speech-to-text ---
    let activeRecorders = {};
    let activeTimers = {};
    let activeRecognitions = {};

    window.spToggleRec = async function(id, maxSeconds) {
        const recBtn = document.getElementById(`rec-${id}`);
        const status = document.getElementById(`status-${id}`);
        const timerSpan = document.getElementById(`timer-${id}`);
        const playback = document.getElementById(`play-${id}`);
        const transcriptBox = document.getElementById(`transcript-${id}`);

        if (recBtn.classList.contains('recording')) {
            // STOP
            recBtn.classList.remove('recording');
            status.textContent = 'Recording stopped';
            timerSpan.style.display = 'none';

            // Stop timer
            if (activeTimers[id]) { clearInterval(activeTimers[id]); activeTimers[id] = null; }

            // Stop recorder
            if (activeRecorders[id]) {
                const blob = await activeRecorders[id].stop();
                const blobUrl = URL.createObjectURL(blob);
                activeRecorders[id].destroy();
                activeRecorders[id] = null;

                if (isMockMode) {
                    // Mock: always save audio for review
                    playback.src = blobUrl;
                    playback.style.display = 'block';
                    allResponses.push({ id, transcript: transcriptBox.textContent || '', hasAudio: true });
                } else {
                    // Practice: show playback but don't persist
                    playback.src = blobUrl;
                    playback.style.display = 'block';
                    allResponses.push({ id, transcript: transcriptBox.textContent || '', hasAudio: false });
                    // Show reset button
                    const resetBtn = document.getElementById(`reset-${id}`);
                    if (resetBtn) resetBtn.style.display = 'inline-flex';
                }
            }

            // Stop speech recognition
            if (activeRecognitions[id]) {
                activeRecognitions[id].stop();
                activeRecognitions[id] = null;
            }
        } else {
            // START — play "Svara nu" beep first
            status.textContent = 'Get ready...';
            try {
                const beep = new Audio('/api/speaking/beep');
                beep.play();
                await new Promise(r => beep.addEventListener('ended', r));
            } catch(e) {}

            // Start recording
            recBtn.classList.add('recording');
            status.textContent = 'Recording...';
            transcriptBox.textContent = '';

            try {
                const rec = new AudioRecorder();
                await rec.init();
                rec.start();
                activeRecorders[id] = rec;
            } catch(e) {
                alert('Microphone access denied. If using the desktop app, try opening http://localhost:5123 in Chrome instead.');
                recBtn.classList.remove('recording');
                status.textContent = 'Mic error — try Chrome browser';
                return;
            }

            // Start countdown timer — synced with recording
            let remaining = maxSeconds;
            timerSpan.style.display = 'inline';
            timerSpan.textContent = formatTimer(remaining);
            timerSpan.classList.remove('timer-warning', 'timer-danger');

            activeTimers[id] = setInterval(() => {
                remaining--;
                timerSpan.textContent = formatTimer(remaining);
                if (remaining <= 5) timerSpan.classList.add('timer-danger');
                else if (remaining <= 10) timerSpan.classList.add('timer-warning');

                if (remaining <= 0) {
                    // Auto-stop
                    window.spToggleRec(id, maxSeconds);
                }
            }, 1000);

            // Start speech-to-text
            if (SpeechRecognition) {
                const recog = new SpeechRecognition();
                recog.lang = 'sv-SE';
                recog.continuous = true;
                recog.interimResults = true;
                let finalText = '';

                recog.onresult = (event) => {
                    let interim = '';
                    finalText = '';
                    for (let i = 0; i < event.results.length; i++) {
                        if (event.results[i].isFinal) {
                            finalText += event.results[i][0].transcript + ' ';
                        } else {
                            interim += event.results[i][0].transcript;
                        }
                    }
                    transcriptBox.textContent = finalText + (interim ? '...' + interim : '');
                };
                recog.onerror = () => {};
                recog.onend = () => {
                    if (recBtn.classList.contains('recording')) {
                        try { recog.start(); } catch(e) {}
                    }
                };
                recog.start();
                activeRecognitions[id] = recog;
            } else {
                transcriptBox.textContent = '(Speech-to-text not supported — use Chrome)';
            }
        }
    };

    // Reset recording — practice mode only
    window.spResetRec = function(id, maxSeconds) {
        const playback = document.getElementById(`play-${id}`);
        const transcriptBox = document.getElementById(`transcript-${id}`);
        const status = document.getElementById(`status-${id}`);
        const resetBtn = document.getElementById(`reset-${id}`);
        const timerSpan = document.getElementById(`timer-${id}`);

        // Revoke old blob URL to free memory
        if (playback.src) URL.revokeObjectURL(playback.src);
        playback.src = '';
        playback.style.display = 'none';
        transcriptBox.textContent = 'Your answer will appear here...';
        status.textContent = 'Press to record';
        timerSpan.style.display = 'none';
        timerSpan.classList.remove('timer-warning', 'timer-danger');
        if (resetBtn) resetBtn.style.display = 'none';

        // Remove the old response for this id
        allResponses = allResponses.filter(r => r.id !== id);
    };

    function formatTimer(s) {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    // --- Results ---
    function showResults() {
        examDiv.style.display = 'none';
        results.style.display = 'block';

        const list = document.getElementById('sp-results-list');
        if (allResponses.length === 0) {
            list.innerHTML = '<p class="empty-state">No responses recorded.</p>';
            return;
        }

        list.innerHTML = allResponses.map((r, i) => `
            <div style="padding:12px;background:var(--bg);border-radius:var(--radius-sm);margin-bottom:8px;">
                <strong>Response ${i + 1}</strong>
                <p style="margin-top:4px;font-size:13px;color:var(--text-dim);">${escapeHtml(r.transcript || '(no transcript)')}</p>
            </div>
        `).join('');
    }

    // --- AI Feedback ---
    document.getElementById('sp-evaluate-btn').addEventListener('click', async () => {
        const btn = document.getElementById('sp-evaluate-btn');
        btn.disabled = true;
        btn.textContent = 'Evaluating...';
        const feedbackDiv = document.getElementById('sp-ai-feedback');

        const { ok, data } = await Api.post('/api/yki/evaluate', {
            exam_type: 'speaking',
            answers: allResponses.map(r => ({ transcript: r.transcript })),
            exam_data: testData,
        });

        btn.disabled = false;
        btn.textContent = 'Get AI Feedback';
        feedbackDiv.style.display = 'block';
        feedbackDiv.textContent = data.feedback || 'No feedback available.';
        if (data.score) {
            document.getElementById('sp-score').textContent = data.score + '%';
        }
    });

    // --- Cleanup ---
    function stopAll() {
        for (const id in activeRecorders) {
            if (activeRecorders[id]) { activeRecorders[id].destroy(); }
        }
        for (const id in activeTimers) {
            if (activeTimers[id]) { clearInterval(activeTimers[id]); }
        }
        for (const id in activeRecognitions) {
            if (activeRecognitions[id]) { activeRecognitions[id].stop(); }
        }
        activeRecorders = {};
        activeTimers = {};
        activeRecognitions = {};
    }

    return {
        destroy() { stopAll(); }
    };
}
