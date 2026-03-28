// TTS View — extracted from original inline JS
function initTtsView() {
    let voices = [];
    let recentFolders = [];
    let selectedSavePath = '';
    let browserCurrentPath = '';

    const textInput = document.getElementById('tts-text-input');
    const charCount = document.getElementById('tts-char-count');
    const voiceSelect = document.getElementById('tts-voice-select');
    const formatSelect = document.getElementById('tts-format-select');
    const quickFolder = document.getElementById('tts-quick-folder');
    const browseBtn = document.getElementById('tts-browse-btn');
    const currentSavePath = document.getElementById('tts-current-save-path');
    const filterFolder = document.getElementById('tts-filter-folder');
    const filenameInput = document.getElementById('tts-filename-input');
    const generateBtn = document.getElementById('tts-generate-btn');
    const resultArea = document.getElementById('tts-result-area');
    const resultFilename = document.getElementById('tts-result-filename');
    const resultSize = document.getElementById('tts-result-size');
    const resultPath = document.getElementById('tts-result-path');
    const resultAudio = document.getElementById('tts-result-audio');
    const filesList = document.getElementById('tts-files-list');

    const browserOverlay = document.getElementById('tts-browser-overlay');
    const browserUp = document.getElementById('tts-browser-up');
    const browserPathInput = document.getElementById('tts-browser-path-input');
    const browserGo = document.getElementById('tts-browser-go');
    const browserList = document.getElementById('tts-browser-list');
    const browserCancel = document.getElementById('tts-browser-cancel');
    const browserSelect = document.getElementById('tts-browser-select');

    const listenBtn = document.getElementById('tts-listen-btn');
    const listenPlayer = document.getElementById('tts-listen-player');
    const listenAudio = document.getElementById('tts-listen-audio');
    const saveToggle = document.getElementById('tts-save-toggle');
    const saveSection = document.getElementById('tts-save-section');

    if (!textInput) return {};

    textInput.addEventListener('input', () => {
        charCount.textContent = textInput.value.length;
    });

    // Listen button — play without saving
    listenBtn.addEventListener('click', async () => {
        const text = textInput.value.trim();
        if (!text) { alert('Please enter some text.'); return; }

        const btnText = listenBtn.querySelector('.btn-text');
        const btnLoading = listenBtn.querySelector('.btn-loading');
        listenBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';

        try {
            const { ok, data } = await Api.post('/api/synthesize', {
                text,
                voice_id: voiceSelect.value,
                format: 'wav',
                save_path: '',
                filename: '',
            });
            if (!ok) { alert(data.error || 'Failed'); return; }

            const url = `/api/files/play?folder=${encodeURIComponent(data.folder)}&name=${encodeURIComponent(data.filename)}`;
            listenAudio.src = url;
            listenPlayer.style.display = 'block';
            listenAudio.play();
            // Clean up temp file after playing
            listenAudio.onended = () => {
                Api.post('/api/files/delete', { folder: data.folder, name: data.filename });
            };
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            listenBtn.disabled = false;
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
        }
    });

    // Ctrl/Cmd+Enter to listen
    textInput.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') listenBtn.click();
    });

    // Toggle save section
    saveToggle.addEventListener('click', () => {
        const visible = saveSection.style.display !== 'none';
        saveSection.style.display = visible ? 'none' : 'block';
        saveToggle.innerHTML = visible ? 'Save to File &darr;' : 'Hide Save Options &uarr;';
    });

    async function loadVoices() {
        voices = await Api.get('/api/voices');
        voiceSelect.innerHTML = voices.map(v =>
            `<option value="${v.id}">${v.name}</option>`
        ).join('');
    }

    async function loadRecentFolders() {
        recentFolders = await Api.get('/api/recent-folders');
        quickFolder.innerHTML = recentFolders.map(f =>
            `<option value="${f.path}">${f.name}</option>`
        ).join('');
        selectedSavePath = quickFolder.value;
        updatePathDisplay();
        filterFolder.innerHTML = `<option value="">All (Default Output)</option>` +
            recentFolders.map(f => `<option value="${f.path}">${f.name}</option>`).join('');
    }

    function updatePathDisplay() {
        currentSavePath.textContent = selectedSavePath;
    }

    quickFolder.addEventListener('change', () => {
        selectedSavePath = quickFolder.value;
        updatePathDisplay();
    });

    // Folder browser
    browseBtn.addEventListener('click', () => {
        browserOverlay.style.display = 'flex';
        browseTo(selectedSavePath || '');
    });

    async function browseTo(path) {
        const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : '/api/browse';
        const res = await fetch(url);
        if (!res.ok) { alert('Cannot open folder'); return; }
        const data = await res.json();
        browserCurrentPath = data.current;
        browserPathInput.value = data.current;
        browserUp.disabled = !data.parent;
        browserUp.onclick = () => { if (data.parent) browseTo(data.parent); };

        if (data.directories.length === 0) {
            browserList.innerHTML = '<p class="empty-state">No subfolders</p>';
        } else {
            browserList.innerHTML = data.directories.map(d => `
                <div class="browser-item" data-path="${d.path}">
                    <span class="folder-icon">\uD83D\uDCC1</span>
                    <span class="folder-name">${d.name}</span>
                </div>
            `).join('');
            browserList.querySelectorAll('.browser-item').forEach(el => {
                el.addEventListener('dblclick', () => browseTo(el.dataset.path));
                el.addEventListener('click', () => {
                    browserList.querySelectorAll('.browser-item').forEach(e => e.classList.remove('selected'));
                    el.classList.add('selected');
                    browserCurrentPath = el.dataset.path;
                    browserPathInput.value = el.dataset.path;
                });
            });
        }
    }

    browserGo.addEventListener('click', () => {
        const val = browserPathInput.value.trim();
        if (val) browseTo(val);
    });
    browserPathInput.addEventListener('keydown', e => { if (e.key === 'Enter') browserGo.click(); });
    browserCancel.addEventListener('click', () => { browserOverlay.style.display = 'none'; });
    browserOverlay.addEventListener('click', e => { if (e.target === browserOverlay) browserOverlay.style.display = 'none'; });

    browserSelect.addEventListener('click', () => {
        selectedSavePath = browserCurrentPath;
        updatePathDisplay();
        const match = Array.from(quickFolder.options).find(o => o.value === selectedSavePath);
        if (match) {
            quickFolder.value = selectedSavePath;
        } else {
            const opt = document.createElement('option');
            opt.value = selectedSavePath;
            opt.textContent = selectedSavePath.split('/').pop() + ' (custom)';
            quickFolder.prepend(opt);
            quickFolder.value = selectedSavePath;
        }
        browserOverlay.style.display = 'none';
    });

    // File list
    async function loadFiles() {
        const folder = filterFolder.value;
        const url = folder ? `/api/files?folder=${encodeURIComponent(folder)}` : '/api/files';
        const files = await Api.get(url);

        if (files.length === 0) {
            filesList.innerHTML = '<p class="empty-state">No files yet. Generate some speech!</p>';
            return;
        }

        filesList.innerHTML = files.map(f => {
            const ef = f.folder.replace(/'/g, "\\'");
            const en = f.name.replace(/'/g, "\\'");
            return `
            <div class="file-item">
                <div class="file-info">
                    <span class="file-name">${escapeHtml(f.name)}</span>
                    <span class="file-meta">
                        <span class="badge">${escapeHtml(f.folder_short)}</span>
                        <span class="badge format-${f.format}">${f.format.toUpperCase()}</span>
                        <span>${formatSize(f.size)}</span>
                        <span>${formatDate(f.created)}</span>
                    </span>
                </div>
                <div class="file-actions">
                    <button class="btn btn-small" onclick="ttsPlayFile('${ef}', '${en}')">Play</button>
                    <button class="btn btn-small" onclick="ttsDownloadFile('${ef}', '${en}')">Download</button>
                    <button class="btn btn-small btn-danger" onclick="ttsDeleteFile('${ef}', '${en}')">Delete</button>
                </div>
            </div>`;
        }).join('');
    }

    filterFolder.addEventListener('change', loadFiles);

    // Generate
    generateBtn.addEventListener('click', async () => {
        const text = textInput.value.trim();
        if (!text) { alert('Please enter some text.'); return; }

        const btnText = generateBtn.querySelector('.btn-text');
        const btnLoading = generateBtn.querySelector('.btn-loading');
        generateBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';

        try {
            const { ok, data } = await Api.post('/api/synthesize', {
                text,
                voice_id: voiceSelect.value,
                format: formatSelect.value,
                save_path: selectedSavePath,
                filename: filenameInput.value.trim(),
            });

            if (!ok) { alert(data.error || 'Generation failed'); return; }

            resultFilename.textContent = data.filename;
            resultSize.textContent = formatSize(data.size);
            resultPath.textContent = data.path;
            resultAudio.src = `/api/files/play?folder=${encodeURIComponent(data.folder)}&name=${encodeURIComponent(data.filename)}`;
            resultArea.style.display = 'block';
            loadFiles();
            filenameInput.value = '';
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            generateBtn.disabled = false;
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
        }
    });

    textInput.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') generateBtn.click();
    });

    // Global functions for inline onclick handlers
    window.ttsPlayFile = function(folder, name) {
        resultAudio.src = `/api/files/play?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(name)}`;
        resultFilename.textContent = name;
        resultSize.textContent = '';
        resultPath.textContent = folder + '/' + name;
        resultArea.style.display = 'block';
        resultAudio.play();
    };

    window.ttsDownloadFile = function(folder, name) {
        const a = document.createElement('a');
        a.href = `/api/files/play?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(name)}`;
        a.download = name;
        a.click();
    };

    window.ttsDeleteFile = async function(folder, name) {
        if (!confirm(`Delete ${name}?`)) return;
        await Api.post('/api/files/delete', { folder, name });
        loadFiles();
    };

    // Init
    Promise.all([loadVoices(), loadRecentFolders()]).then(() => loadFiles());

    return { destroy() {} };
}
