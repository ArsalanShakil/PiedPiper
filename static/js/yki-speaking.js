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
    let allTests = [];
    let allResponses = [];
    let isMockMode = false;
    let aborted = false;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    // Active resources to clean up
    let activeRecorder = null;
    let activeRecognition = null;
    let activeTimer = null;

    // --- Load options ---
    (async () => {
        allTests = await Api.get('/api/speaking/tests');
        const sel = document.getElementById('sp-test-select');
        sel.innerHTML = '<option value="random">Random (full exam)</option>' +
            '<option value="mix">Random Mix (parts from different tests)</option>' +
            allTests.map(t => `<option value="${t.number}">Prov ${t.number} — ${t.topic}</option>`).join('');

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

    // --- Start Mock ---
    document.getElementById('sp-mock-go').addEventListener('click', async () => {
        const choice = document.getElementById('sp-test-select').value;
        menu.style.display = 'none';
        loading.style.display = 'block';

        let data;
        if (choice === 'random') data = await Api.get('/api/speaking/random');
        else if (choice === 'mix') data = await Api.get('/api/speaking/mix');
        else data = await Api.get(`/api/speaking/test/${choice}`);

        if (data.error) { alert(data.error); loading.style.display = 'none'; menu.style.display = 'block'; return; }

        isMockMode = true;
        testData = data;
        allResponses = [];
        aborted = false;
        document.getElementById('sp-exam-title').textContent = data.number
            ? `Prov ${data.number} — ${data.topic}` : `Mock Test — ${data.topic || 'Mixed'}`;

        loading.style.display = 'none';
        examDiv.style.display = 'block';
        document.getElementById('sp-next-part').style.display = 'none';
        runAllParts();
    });

    // --- Practice: Random ---
    document.getElementById('sp-practice-random').addEventListener('click', async () => {
        const partType = document.getElementById('sp-part-type').value;
        const topic = document.getElementById('sp-topic-select').value;
        menu.style.display = 'none';
        loading.style.display = 'block';

        const data = await Api.get(`/api/speaking/practice?type=${encodeURIComponent(partType)}&topic=${encodeURIComponent(topic)}`);
        if (data.error) { alert(data.error); loading.style.display = 'none'; menu.style.display = 'block'; return; }

        startPractice(data);
    });

    // --- Practice: Browse questions ---
    document.getElementById('sp-practice-browse').addEventListener('click', async () => {
        const partType = document.getElementById('sp-part-type').value;
        const topic = document.getElementById('sp-topic-select').value;
        const browser = document.getElementById('sp-question-browser');

        browser.innerHTML = '<p style="padding:12px;color:var(--text-light);">Loading questions...</p>';
        browser.style.display = 'block';

        const items = await Api.get(`/api/speaking/browse?type=${encodeURIComponent(partType)}&topic=${encodeURIComponent(topic)}`);

        if (!items.length) {
            browser.innerHTML = '<p class="empty-state">No questions found.</p>';
            return;
        }

        // Group by topic
        const grouped = {};
        items.forEach(item => {
            const key = `Prov ${item.test} — ${item.topic}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(item);
        });

        let html = '';
        for (const [group, questions] of Object.entries(grouped)) {
            html += `<div style="margin-bottom:12px;">
                <div style="font-size:12px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.5px;padding:4px 0;">${escapeHtml(group)}</div>`;
            questions.forEach(q => {
                html += `<div class="sp-browse-item" data-id="${q.id}" style="padding:10px 12px;border:1px solid var(--border-light);border-radius:var(--radius-sm);margin-bottom:4px;cursor:pointer;transition:border-color 0.1s;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <span class="badge" style="margin-right:6px;">${escapeHtml(q.part_label)}</span>
                            <strong style="font-size:13px;">${escapeHtml(q.title)}</strong>
                        </div>
                        <button class="btn btn-small" style="flex-shrink:0;">Start</button>
                    </div>
                    <p style="font-size:12px;color:var(--text-light);margin-top:4px;">${escapeHtml(q.preview)}</p>
                </div>`;
            });
            html += '</div>';
        }
        browser.innerHTML = html;

        // Click handlers
        browser.querySelectorAll('.sp-browse-item').forEach(el => {
            el.addEventListener('click', () => {
                const qId = el.dataset.id;
                const item = items.find(i => i.id === qId);
                if (item) startPractice(item.data);
            });
        });
    });

    // Update browser when filters change
    document.getElementById('sp-part-type').addEventListener('change', () => {
        document.getElementById('sp-question-browser').style.display = 'none';
    });
    document.getElementById('sp-topic-select').addEventListener('change', () => {
        document.getElementById('sp-question-browser').style.display = 'none';
    });

    function startPractice(partData) {
        isMockMode = false;
        testData = { number: 0, topic: partData.test_topic || 'Practice', parts: [partData] };
        allResponses = [];
        aborted = false;
        document.getElementById('sp-exam-title').textContent = `Practice — ${partData.title || partData.topic || ''}`;

        menu.style.display = 'none';
        loading.style.display = 'none';
        examDiv.style.display = 'block';
        document.getElementById('sp-next-part').textContent = 'Restart';
        document.getElementById('sp-next-part').style.display = 'inline-flex';
        runAllParts();
    }

    // --- Exit / Restart ---
    document.getElementById('sp-back-menu').addEventListener('click', () => {
        aborted = true;
        stopAll();
        examDiv.style.display = 'none';
        menu.style.display = 'block';
    });

    document.getElementById('sp-next-part').addEventListener('click', () => {
        // Practice restart
        aborted = true;
        stopAll();
        setTimeout(() => {
            aborted = false;
            allResponses = [];
            runAllParts();
        }, 200);
    });

    // ===================== AUTO-RUN ENGINE =====================

    async function runAllParts() {
        const parts = testData.parts || [];
        for (let pi = 0; pi < parts.length; pi++) {
            if (aborted) return;
            const part = parts[pi];
            partLabel.textContent = `Del ${part.part || pi + 1}: ${part.title}`;

            if (part.type === 'dialogues') {
                for (const dialog of (part.items || [])) {
                    if (aborted) return;
                    // Show situation
                    showStatus(`Dialog: ${dialog.title}`, dialog.situation);
                    await sleep(2000);

                    for (let li = 0; li < dialog.lines.length; li++) {
                        if (aborted) return;
                        const line = dialog.lines[li];
                        await runSingleItem({
                            id: `d${pi}-${li}`,
                            promptText: line.prompt,
                            instructionText: line.instruction,
                            prepSeconds: part.prep_seconds || 15,
                            answerSeconds: part.answer_seconds || 20,
                        });
                    }
                }
            } else if (part.type === 'react') {
                for (let i = 0; i < (part.items || []).length; i++) {
                    if (aborted) return;
                    const item = part.items[i];
                    await runSingleItem({
                        id: `r${pi}-${i}`,
                        promptText: item.situation,
                        instructionText: item.instruction,
                        prepSeconds: part.prep_seconds || 20,
                        answerSeconds: part.answer_seconds || 30,
                    });
                }
            } else if (part.type === 'narrate' || part.type === 'opinion') {
                const fullPrompt = part.topic + '. ' + (part.prompts || []).join('. ');
                await runSingleItem({
                    id: `n${pi}`,
                    promptText: fullPrompt,
                    instructionText: (part.prompts || []).join('\n'),
                    prepSeconds: part.prep_seconds || 60,
                    answerSeconds: part.answer_seconds || 90,
                    showBullets: part.prompts,
                    topicTitle: part.topic,
                });
            }
        }

        // All parts done
        if (!aborted) showResults();
    }

    // ===================== SINGLE ITEM FLOW =====================
    // Listen (2x) → Prep countdown → Beep → Record+Timer → Auto-stop

    async function runSingleItem(opts) {
        const { id, promptText, instructionText, prepSeconds, answerSeconds, showBullets, topicTitle } = opts;

        // Render the current item UI
        let html = `<div class="speaking-active-item">`;
        if (topicTitle) {
            html += `<h3 style="margin-bottom:8px;">${escapeHtml(topicTitle)}</h3>`;
        }
        html += `<div class="speaking-prompt" id="item-prompt">
                <p style="font-size:15px;line-height:1.7;">${escapeHtml(promptText)}</p>`;
        if (showBullets && showBullets.length > 0) {
            html += '<ul style="margin-top:8px;padding-left:20px;">';
            showBullets.forEach(b => { html += `<li style="margin-bottom:4px;font-size:14px;">${escapeHtml(b)}</li>`; });
            html += '</ul>';
        }
        html += `</div>`;
        if (instructionText && !showBullets) {
            html += `<p style="font-size:13px;color:var(--text-light);margin-top:8px;font-style:italic;">${escapeHtml(instructionText)}</p>`;
        }
        html += `
            <div class="speaking-flow-status" id="flow-status" style="margin-top:16px;padding:16px;border-radius:var(--radius-sm);background:var(--bg);text-align:center;">
                <div id="flow-phase" style="font-size:14px;font-weight:600;color:var(--primary);margin-bottom:8px;">Listening...</div>
                <div id="flow-timer" class="exam-timer" style="font-size:32px;">--:--</div>
            </div>
            <div style="margin-top:12px;">
                <audio id="flow-playback" controls style="display:none;width:100%;height:32px;"></audio>
            </div>
            <div class="transcript-box" id="flow-transcript" style="margin-top:8px;">Waiting...</div>
        </div>`;

        currentPartDiv.innerHTML = html;

        const phaseEl = document.getElementById('flow-phase');
        const timerDisplay = document.getElementById('flow-timer');
        const playbackEl = document.getElementById('flow-playback');
        const transcriptEl = document.getElementById('flow-transcript');
        const flowStatus = document.getElementById('flow-status');

        // STEP 1: Play prompt twice via TTS
        phaseEl.textContent = 'Listening... (played 2 times)';
        timerDisplay.textContent = '';
        flowStatus.style.background = '#eff6ff';

        const { ok, data } = await Api.post('/api/speaking/tts', { text: promptText });
        if (ok && !aborted) {
            await playAudioTwice(data.url);
        }
        if (aborted) return;

        // STEP 2: Prep countdown
        phaseEl.textContent = 'Prepare your answer...';
        flowStatus.style.background = '#fffbeb';
        transcriptEl.textContent = 'Preparing...';
        await countdown(timerDisplay, prepSeconds);
        if (aborted) return;

        // STEP 3: Beep + start recording
        phaseEl.textContent = 'Svara nu! (Answer now)';
        flowStatus.style.background = '#fef2f2';
        transcriptEl.textContent = '';

        // Play beep
        try {
            const beep = new Audio('/api/speaking/beep');
            beep.play();
            await new Promise(r => { beep.addEventListener('ended', r); setTimeout(r, 2000); });
        } catch(e) {}
        if (aborted) return;

        // Start recording + speech-to-text
        phaseEl.textContent = 'Recording...';
        let transcript = '';

        try {
            activeRecorder = new AudioRecorder();
            await activeRecorder.init();
            activeRecorder.start();
        } catch(e) {
            phaseEl.textContent = 'Mic error — try Chrome browser';
            await sleep(2000);
            return;
        }

        // Speech-to-text
        if (SpeechRecognition) {
            activeRecognition = new SpeechRecognition();
            activeRecognition.lang = 'sv-SE';
            activeRecognition.continuous = true;
            activeRecognition.interimResults = true;
            activeRecognition.onresult = (event) => {
                let final = '', interim = '';
                for (let i = 0; i < event.results.length; i++) {
                    if (event.results[i].isFinal) final += event.results[i][0].transcript + ' ';
                    else interim += event.results[i][0].transcript;
                }
                transcript = final;
                transcriptEl.textContent = final + (interim ? '...' + interim : '');
            };
            activeRecognition.onerror = () => {};
            activeRecognition.onend = () => {
                if (activeRecorder && activeRecorder.isRecording) {
                    try { activeRecognition.start(); } catch(e) {}
                }
            };
            activeRecognition.start();
        }

        // STEP 4: Answer countdown (synced with recording)
        await countdown(timerDisplay, answerSeconds, (remaining) => {
            if (remaining <= 5) flowStatus.style.background = '#fef2f2';
        });

        // STEP 5: Auto-stop recording
        phaseEl.textContent = 'Time\'s up!';
        flowStatus.style.background = 'var(--bg)';

        if (activeRecognition) { try { activeRecognition.stop(); } catch(e) {} activeRecognition = null; }

        if (activeRecorder) {
            const blob = await activeRecorder.stop();
            activeRecorder.destroy();
            activeRecorder = null;

            if (isMockMode) {
                const blobUrl = URL.createObjectURL(blob);
                playbackEl.src = blobUrl;
                playbackEl.style.display = 'block';
            }

            allResponses.push({ id, transcript: transcript || transcriptEl.textContent || '', hasAudio: isMockMode });
        }

        transcriptEl.textContent = transcript || transcriptEl.textContent || '(no speech detected)';

        // Brief pause before next item
        await sleep(isMockMode ? 1500 : 2000);
    }

    // ===================== HELPERS =====================

    function playAudioTwice(url) {
        return new Promise((resolve) => {
            const audio = new Audio(url);
            let count = 0;
            audio.addEventListener('ended', () => {
                count++;
                if (count < 2) {
                    setTimeout(() => { if (!aborted) audio.play(); else resolve(); }, 800);
                } else {
                    resolve();
                }
            });
            audio.addEventListener('error', resolve);
            audio.play().catch(resolve);
        });
    }

    function countdown(el, seconds, onTick) {
        return new Promise((resolve) => {
            let remaining = seconds;
            el.textContent = fmtTime(remaining);
            el.classList.remove('timer-warning', 'timer-danger');

            activeTimer = setInterval(() => {
                if (aborted) { clearInterval(activeTimer); activeTimer = null; resolve(); return; }
                remaining--;
                el.textContent = fmtTime(remaining);
                if (remaining <= 5) { el.classList.add('timer-danger'); el.classList.remove('timer-warning'); }
                else if (remaining <= 10) el.classList.add('timer-warning');
                if (onTick) onTick(remaining);

                if (remaining <= 0) {
                    clearInterval(activeTimer);
                    activeTimer = null;
                    resolve();
                }
            }, 1000);
        });
    }

    function fmtTime(s) {
        return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    function showStatus(title, desc) {
        currentPartDiv.innerHTML = `
            <div style="text-align:center;padding:40px;">
                <h3>${escapeHtml(title)}</h3>
                <p style="color:var(--text-dim);margin-top:8px;">${escapeHtml(desc || '')}</p>
            </div>`;
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

        const { ok, data } = await Api.post('/api/yki/evaluate', {
            exam_type: 'speaking',
            answers: allResponses.map(r => ({ transcript: r.transcript })),
            exam_data: testData,
        });

        btn.disabled = false;
        btn.textContent = 'Get AI Feedback';
        document.getElementById('sp-ai-feedback').style.display = 'block';
        document.getElementById('sp-ai-feedback').textContent = data.feedback || 'No feedback available.';
        if (data.score) document.getElementById('sp-score').textContent = data.score + '%';
    });

    // --- Cleanup ---
    function stopAll() {
        if (activeTimer) { clearInterval(activeTimer); activeTimer = null; }
        if (activeRecorder) { try { activeRecorder.stop(); } catch(e) {} activeRecorder.destroy(); activeRecorder = null; }
        if (activeRecognition) { try { activeRecognition.stop(); } catch(e) {} activeRecognition = null; }
    }

    return { destroy() { aborted = true; stopAll(); } };
}
