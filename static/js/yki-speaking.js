function initYkiSpeakingView() {
    const setup = document.getElementById('speaking-setup');
    const loading = document.getElementById('speaking-loading');
    const exam = document.getElementById('speaking-exam');
    const results = document.getElementById('speaking-results');
    const topicSelect = document.getElementById('speaking-topic');
    const partsDiv = document.getElementById('speaking-parts');
    let timer = null;
    let examData = null;
    let sessionId = null;
    let recorders = {};
    let transcripts = {};
    let audioBlobs = {};

    if (!setup) return {};

    // Check Speech Recognition support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    (async () => {
        const topics = await Api.get('/api/yki/topics');
        topicSelect.innerHTML = '<option value="">Random</option>' +
            topics.map(t => `<option value="${t}">${t}</option>`).join('');
    })();

    document.getElementById('speaking-start').addEventListener('click', async () => {
        setup.style.display = 'none';
        loading.style.display = 'block';

        const { ok, data } = await Api.post('/api/yki/generate', {
            exam_type: 'speaking', topic: topicSelect.value,
        });

        if (!ok || data.error) { alert(data.error || 'Failed'); loading.style.display = 'none'; setup.style.display = 'block'; return; }

        sessionId = data.session_id;
        examData = data.data;

        loading.style.display = 'none';
        renderExam();
    });

    function renderExam() {
        exam.style.display = 'block';
        timer = new ExamTimer(document.getElementById('speaking-timer'), 1500, null, () => submitExam());
        timer.start();

        const parts = examData.parts || [];
        partsDiv.innerHTML = parts.map((part, pi) => `
            <div class="speaking-part">
                <div class="task-header">
                    <h3>Part ${part.part || pi + 1}: ${escapeHtml(part.title || '')}</h3>
                    <span style="font-size:12px;color:var(--text-light);">
                        ${part.prep_seconds ? `Prep: ${part.prep_seconds}s` : ''}
                        ${part.answer_seconds ? ` | Answer: ${part.answer_seconds}s` : ''}
                    </span>
                </div>
                <p style="font-size:13px;color:var(--text-dim);margin-bottom:12px;">${escapeHtml(part.instructions || '')}</p>

                ${(part.prompts || []).map((prompt, pri) => `
                    <div class="speaking-prompt">
                        <p>${escapeHtml(prompt)}</p>
                        <button class="btn btn-small" onclick="speakPrompt(this, '${escapeHtml(prompt).replace(/'/g, "\\'")}')">
                            Listen to question
                        </button>
                    </div>
                `).join('')}

                <div class="recording-controls">
                    <button class="rec-btn" id="rec-btn-${pi}" onclick="toggleRecording(${pi})">
                        <div class="rec-dot"></div>
                    </button>
                    <span class="recording-status" id="rec-status-${pi}">Click to start recording</span>
                    <audio id="rec-playback-${pi}" controls style="display:none;height:32px;"></audio>
                </div>
                <div class="transcript-box" id="transcript-${pi}">Your speech will be transcribed here...</div>
            </div>
        `).join('');
    }

    // Speak prompt via TTS
    window.speakPrompt = async function(btn, text) {
        btn.disabled = true;
        btn.textContent = 'Speaking...';
        const url = await ttsSpeak(text);
        if (url) {
            const audio = new Audio(url);
            audio.play();
            audio.addEventListener('ended', () => {
                btn.disabled = false;
                btn.textContent = 'Listen to question';
            });
        } else {
            btn.disabled = false;
            btn.textContent = 'Listen to question';
        }
    };

    // Toggle recording with speech-to-text
    window.toggleRecording = async function(partIndex) {
        const btn = document.getElementById(`rec-btn-${partIndex}`);
        const status = document.getElementById(`rec-status-${partIndex}`);
        const playback = document.getElementById(`rec-playback-${partIndex}`);
        const transcriptBox = document.getElementById(`transcript-${partIndex}`);

        if (btn.classList.contains('recording')) {
            // Stop recording
            btn.classList.remove('recording');
            status.textContent = 'Recording stopped';

            if (recorders[partIndex]) {
                const blob = await recorders[partIndex].stop();
                audioBlobs[partIndex] = blob;
                playback.src = URL.createObjectURL(blob);
                playback.style.display = 'block';
                recorders[partIndex].destroy();
                recorders[partIndex] = null;
            }

            // Stop speech recognition
            if (window._activeRecognition && window._activeRecognition[partIndex]) {
                window._activeRecognition[partIndex].stop();
                window._activeRecognition[partIndex] = null;
            }
        } else {
            // Start recording
            btn.classList.add('recording');
            status.textContent = 'Recording... speak now';
            transcriptBox.textContent = '';
            transcripts[partIndex] = '';

            // Start audio recorder
            try {
                const recorder = new AudioRecorder();
                await recorder.init();
                recorder.start();
                recorders[partIndex] = recorder;
            } catch (e) {
                alert('Microphone access denied. Please allow microphone access.');
                btn.classList.remove('recording');
                status.textContent = 'Microphone error';
                return;
            }

            // Start speech-to-text
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognition.lang = 'sv-SE';
                recognition.continuous = true;
                recognition.interimResults = true;

                recognition.onresult = (event) => {
                    let interim = '';
                    let final = '';
                    for (let i = 0; i < event.results.length; i++) {
                        if (event.results[i].isFinal) {
                            final += event.results[i][0].transcript + ' ';
                        } else {
                            interim += event.results[i][0].transcript;
                        }
                    }
                    transcripts[partIndex] = final;
                    transcriptBox.textContent = final + (interim ? '...' + interim : '');
                };

                recognition.onerror = () => {};
                recognition.onend = () => {
                    // Restart if still recording
                    if (btn.classList.contains('recording')) {
                        try { recognition.start(); } catch(e) {}
                    }
                };

                recognition.start();
                if (!window._activeRecognition) window._activeRecognition = {};
                window._activeRecognition[partIndex] = recognition;
            } else {
                transcriptBox.textContent = '(Speech-to-text not supported in this browser. Use Chrome for best results.)';
            }
        }
    };

    document.getElementById('speaking-submit').addEventListener('click', () => submitExam());

    async function submitExam() {
        if (timer) timer.stop();

        // Stop all active recordings
        for (const pi in recorders) {
            if (recorders[pi]) {
                await recorders[pi].stop();
                recorders[pi].destroy();
            }
        }
        if (window._activeRecognition) {
            for (const pi in window._activeRecognition) {
                if (window._activeRecognition[pi]) window._activeRecognition[pi].stop();
            }
        }

        const answers = [];
        const parts = examData.parts || [];
        parts.forEach((part, pi) => {
            answers.push({
                part: pi + 1,
                transcript: transcripts[pi] || '(no speech detected)',
                has_audio: !!audioBlobs[pi],
            });
        });

        exam.style.display = 'none';
        loading.style.display = 'block';
        loading.querySelector('h3').textContent = 'Evaluating your responses...';
        loading.querySelector('p').textContent = 'AI is reviewing your transcribed answers';

        const { ok, data } = await Api.post('/api/yki/evaluate', {
            exam_type: 'speaking', answers, exam_data: examData,
        });

        loading.style.display = 'none';
        results.style.display = 'block';
        document.getElementById('speaking-score').textContent = (data.score || 0) + '%';
        document.getElementById('speaking-feedback').textContent = data.feedback || 'No feedback available.';
    }

    return {
        destroy() {
            if (timer) timer.stop();
            for (const pi in recorders) {
                if (recorders[pi]) recorders[pi].destroy();
            }
        }
    };
}
