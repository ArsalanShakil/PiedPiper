function initEditorView() {
    let quill = null;
    let currentDocId = null;
    let saveTimer = null;
    let lastTranslation = null;
    let isSaving = false;
    let isLoading = false;
    let isDirty = false; // Track if user made any edits

    const docList = document.getElementById('ed-doc-list');
    const newDocBtn = document.getElementById('ed-new-doc');
    const titleInput = document.getElementById('ed-title');
    const docFolder = document.getElementById('ed-doc-folder');
    const folderFilter = document.getElementById('ed-folder-filter');
    const wordCount = document.getElementById('ed-word-count');
    const saveStatus = document.getElementById('ed-save-status');
    const selToolbar = document.getElementById('ed-sel-toolbar');
    const transPanel = document.getElementById('ed-trans-panel');
    const transBody = document.getElementById('ed-trans-body');
    const transActions = document.getElementById('ed-trans-actions');
    const transClose = document.getElementById('ed-trans-close');

    if (!docList) return {};

    // Init Quill
    quill = new Quill('#ed-quill-editor', {
        theme: 'snow',
        placeholder: 'Skriv din svenska text här...',
        modules: {
            toolbar: [
                ['bold', 'italic', 'underline'],
                [{ 'header': [1, 2, 3, false] }],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                ['clean']
            ]
        }
    });

    // --- Vocabulary highlighting ---
    let vocabMap = {};
    let vocabPattern = null;
    let highlightTimer = null;
    let vocabLoaded = false;

    async function loadVocabWords() {
        if (vocabLoaded) return; // Only load once per session
        const items = await Api.get('/api/vocabulary/');
        vocabMap = {};
        items.forEach(v => {
            const key = v.swedish_text.toLowerCase().replace(/[.,!?;:]/g, '').trim();
            if (key) vocabMap[key] = v.translation;
        });
        // Pre-build regex once
        const keys = Object.keys(vocabMap);
        if (keys.length > 0) {
            const escaped = keys.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            vocabPattern = new RegExp('(?:^|[\\s.,;:!?()\\[\\]"\'—–-])(' + escaped.join('|') + ')(?=[\\s.,;:!?()\\[\\]"\'—–-]|$)', 'gi');
        } else {
            vocabPattern = null;
        }
        vocabLoaded = true;
    }

    function reloadVocab() {
        vocabLoaded = false;
        loadVocabWords().then(() => highlightVocabWords());
    }

    function highlightVocabWords() {
        clearTimeout(highlightTimer);
        highlightTimer = setTimeout(() => {
            if (!quill || !vocabPattern) return;
            const text = quill.getText();
            const fullLen = quill.getLength();

            // Clear all color formatting first
            quill.formatText(0, fullLen, 'color', false, 'silent');

            // Apply red to every occurrence of every vocab word
            vocabPattern.lastIndex = 0;
            let match;
            while (match = vocabPattern.exec(text)) {
                const wordStart = match.index + match[0].indexOf(match[1]);
                quill.formatText(wordStart, match[1].length, { 'color': '#dc2626' }, 'silent');
            }
        }, 200); // Fast response
    }

    // Tooltip on hover — look up word under cursor in vocabMap
    const tooltip = document.createElement('div');
    tooltip.className = 'vocab-tooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);

    document.addEventListener('mouseover', (e) => {
        if (!e.target.closest || !e.target.closest('.ql-editor')) return;
        const el = e.target;

        // Check if this element or any parent span has red color
        let span = el;
        while (span && span !== document.body) {
            if (span.tagName === 'SPAN' && span.style && span.style.color) {
                // Extract the word text and look it up
                const word = span.textContent.toLowerCase().replace(/[.,!?;:]/g, '').trim();
                const translation = vocabMap[word];
                if (translation) {
                    tooltip.textContent = translation;
                    tooltip.style.display = 'block';
                    const rect = span.getBoundingClientRect();
                    tooltip.style.top = (rect.bottom + window.scrollY + 4) + 'px';
                    tooltip.style.left = (rect.left + window.scrollX) + 'px';
                    return;
                }
                break; // Found a span with color but no vocab match, stop walking
            }
            span = span.parentElement;
        }
    });

    document.addEventListener('mouseout', (e) => {
        // Hide tooltip when leaving any span
        if (e.target.tagName === 'SPAN') {
            tooltip.style.display = 'none';
        }
    });

    // --- Auto-save ---
    quill.on('text-change', (delta, oldDelta, source) => {
        const text = quill.getText().trim();
        const words = text ? text.split(/\s+/).length : 0;
        wordCount.textContent = words + ' words';
        if (source === 'user' && !isLoading) {
            isDirty = true;
            scheduleSave();
            highlightVocabWords();
        }
    });

    titleInput.addEventListener('input', () => {
        if (!isLoading) {
            isDirty = true;
            scheduleSave();
        }
    });

    function scheduleSave() {
        saveStatus.textContent = 'Saving...';
        saveStatus.style.color = 'var(--text-light)';
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, 600);
    }

    async function saveNow() {
        clearTimeout(saveTimer);
        if (!currentDocId || isSaving || isLoading) return;
        isSaving = true;
        await saveDocument();
        isDirty = false;
        saveStatus.textContent = 'Auto-saved';
        saveStatus.style.color = 'var(--success)';
        isSaving = false;
        loadDocList();
    }

    // Save on navigation — only if user actually edited something
    function saveBeforeLeave() {
        if (!currentDocId || !isDirty) {
            // Nothing to save — just remember the doc ID
            if (currentDocId) localStorage.setItem('piedpiper_last_doc_id', String(currentDocId));
            return;
        }
        const payload = JSON.stringify({
            title: titleInput.value.trim() || 'Untitled',
            folder: (docFolder.value && docFolder.value !== '__new__') ? docFolder.value : 'General',
            content_html: quill.root.innerHTML,
            content_text: quill.getText().trim(),
        });
        // keepalive ensures the request completes even during page navigation
        fetch(`/api/editor/documents/${currentDocId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
        }).catch(() => {});
        localStorage.setItem('piedpiper_last_doc_id', String(currentDocId));
        isDirty = false;
    }

    // --- Folders ---
    async function loadFolders(selectValue) {
        const folders = await Api.get('/api/editor/folders');
        const opts = folders.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');
        docFolder.innerHTML = opts + '<option value="__new__">+ New folder...</option>';
        let filterHtml = '<option value="">All Folders</option>';
        folders.forEach(f => {
            filterHtml += `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`;
        });
        folderFilter.innerHTML = filterHtml;
        if (selectValue) docFolder.value = selectValue;
    }

    docFolder.addEventListener('change', () => {
        if (docFolder.value === '__new__') {
            const name = prompt('New folder name:');
            if (name && name.trim()) {
                const trimmed = name.trim();
                const opt = document.createElement('option');
                opt.value = trimmed;
                opt.textContent = trimmed;
                docFolder.insertBefore(opt, docFolder.querySelector('[value="__new__"]'));
                docFolder.value = trimmed;
                const fopt = document.createElement('option');
                fopt.value = trimmed;
                fopt.textContent = trimmed;
                folderFilter.appendChild(fopt);
                saveNow();
            } else {
                if (currentDocId) {
                    Api.get(`/api/editor/documents/${currentDocId}`).then(doc => {
                        docFolder.value = doc.folder || 'General';
                    });
                } else {
                    docFolder.value = 'General';
                }
            }
        } else {
            saveNow();
        }
    });

    folderFilter.addEventListener('change', loadDocList);

    // --- Selection toolbar ---
    function handleSelection() {
        const sel = window.getSelection();
        const text = sel.toString().trim();
        if (!text || text.length < 2) { selToolbar.classList.remove('visible'); return; }

        const editorEl = document.querySelector('.ql-editor');
        if (!editorEl || !editorEl.contains(sel.anchorNode)) { selToolbar.classList.remove('visible'); return; }

        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        selToolbar.style.top = (rect.top + window.scrollY - 44) + 'px';
        selToolbar.style.left = (rect.left + window.scrollX + rect.width / 2 - 80) + 'px';
        selToolbar.classList.add('visible');
    }

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('keyup', handleSelection);
    document.addEventListener('mousedown', (e) => {
        if (!selToolbar.contains(e.target)) selToolbar.classList.remove('visible');
    });

    // --- Translate ---
    document.getElementById('ed-sel-translate').addEventListener('click', async () => {
        const text = window.getSelection().toString().trim();
        if (!text) return;

        selToolbar.classList.remove('visible');
        transPanel.classList.add('visible');
        transBody.innerHTML = '<p class="trans-loading">Translating...</p>';
        transActions.style.display = 'none';

        const { ok, data } = await Api.post('/api/editor/translate', {
            text, context: quill.getText().trim().substring(0, 500),
        });

        if (!ok) {
            transBody.innerHTML = `<p class="trans-loading">${escapeHtml(data.error || 'Translation failed')}</p>`;
            return;
        }

        lastTranslation = { swedish: text, ...data };
        let html = `<div class="trans-original">"${escapeHtml(text)}"</div>`;
        html += `<div class="trans-result">${escapeHtml(data.translation)}</div>`;

        if (data.word_by_word && data.word_by_word.length > 0) {
            html += '<div class="trans-words"><h4>Word by word</h4>';
            data.word_by_word.forEach((w, i) => {
                html += `<div class="word-pair">
                    <span class="word-sv">${escapeHtml(w.sv)}</span>
                    <span class="word-pair-right">
                        <span class="word-en">${escapeHtml(w.en)}</span>
                        <button class="word-add-btn" data-sv="${escapeHtml(w.sv)}" data-en="${escapeHtml(w.en)}" title="Add to vocabulary">+</button>
                    </span>
                </div>`;
            });
            html += '</div>';
        }
        if (data.grammar_notes) {
            html += `<div class="trans-grammar">${escapeHtml(data.grammar_notes)}</div>`;
        }
        transBody.innerHTML = html;
        transActions.style.display = 'flex';

        // Add-to-vocab buttons on each word
        transBody.querySelectorAll('.word-add-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                await saveVocab(btn.dataset.sv, btn.dataset.en);
                btn.textContent = '✓';
                btn.disabled = true;
                btn.classList.add('word-added');
                // Refresh highlights with new vocab word
                reloadVocab();
            });
        });
    });

    // --- Speak ---
    document.getElementById('ed-sel-speak').addEventListener('click', async () => {
        const text = window.getSelection().toString().trim();
        if (!text) return;
        selToolbar.classList.remove('visible');
        speakText(text);
    });

    document.getElementById('ed-trans-speak').addEventListener('click', () => {
        if (lastTranslation) speakText(lastTranslation.swedish);
    });

    // --- Save to vocabulary ---
    document.getElementById('ed-sel-vocab').addEventListener('click', async () => {
        const text = window.getSelection().toString().trim();
        if (!text) return;
        selToolbar.classList.remove('visible');

        if (lastTranslation && lastTranslation.swedish === text) {
            await saveVocab(text, lastTranslation.translation);
            showToast('Saved to vocabulary!');
        } else {
            transPanel.classList.add('visible');
            transBody.innerHTML = '<p class="trans-loading">Translating & saving...</p>';
            const { ok, data } = await Api.post('/api/editor/translate', { text });
            if (ok) {
                lastTranslation = { swedish: text, ...data };
                await saveVocab(text, data.translation);
                transBody.innerHTML = `<p class="trans-loading">Saved "${escapeHtml(text)}" to vocabulary!</p>`;
                setTimeout(() => { transPanel.classList.remove('visible'); }, 1500);
            }
        }
    });

    document.getElementById('ed-trans-save-vocab').addEventListener('click', async () => {
        if (!lastTranslation) return;
        await saveVocab(lastTranslation.swedish, lastTranslation.translation);
        const btn = document.getElementById('ed-trans-save-vocab');
        btn.textContent = 'Saved!';
        setTimeout(() => { btn.textContent = 'Save to Vocabulary'; }, 1500);
    });

    async function saveVocab(swedish, translation) {
        await Api.post('/api/vocabulary/', {
            swedish_text: swedish, translation, context: quill.getText().trim().substring(0, 200),
        });
        // Refresh highlights
        await loadVocabWords();
        highlightVocabWords();
    }

    function showToast(msg) {
        saveStatus.textContent = msg;
        saveStatus.style.color = 'var(--primary)';
        setTimeout(() => { saveStatus.textContent = 'Auto-saved'; saveStatus.style.color = 'var(--success)'; }, 2000);
    }

    async function speakText(text) {
        const voices = await Api.get('/api/voices');
        if (voices.length === 0) return;
        const { ok, data } = await Api.post('/api/synthesize', {
            text, voice_id: voices[0].id, format: 'wav', save_path: '', filename: '',
        });
        if (ok) {
            const audio = new Audio(`/api/files/play?folder=${encodeURIComponent(data.folder)}&name=${encodeURIComponent(data.filename)}`);
            audio.play();
            audio.addEventListener('ended', () => {
                Api.post('/api/files/delete', { folder: data.folder, name: data.filename });
            });
        }
    }

    transClose.addEventListener('click', () => { transPanel.classList.remove('visible'); });

    // --- Document list with folders ---
    let cachedDocs = null;
    let docListTimer = null;

    async function loadDocList(forceRefresh) {
        // Debounce rapid calls
        if (!forceRefresh && cachedDocs) {
            renderDocList(cachedDocs);
            // Refresh in background
            clearTimeout(docListTimer);
            docListTimer = setTimeout(async () => {
                cachedDocs = await Api.get('/api/editor/documents');
                renderDocList(cachedDocs);
            }, 500);
            return;
        }
        cachedDocs = await Api.get('/api/editor/documents');
        renderDocList(cachedDocs);
    }

    function renderDocList(docs) {
        const filterVal = folderFilter.value;
        const filtered = filterVal ? docs.filter(d => d.folder === filterVal) : docs;

        if (filtered.length === 0) {
            docList.innerHTML = '<p style="padding:12px;color:var(--text-light);font-size:13px;">No documents</p>';
            return;
        }

        const grouped = {};
        filtered.forEach(d => {
            const f = d.folder || 'General';
            if (!grouped[f]) grouped[f] = [];
            grouped[f].push(d);
        });

        let html = '';
        for (const [folder, folderDocs] of Object.entries(grouped)) {
            if (!filterVal) {
                html += `<div class="doc-folder-header">
                    <span>${escapeHtml(folder)}</span>
                    ${folder !== 'General' ? `<button class="folder-delete-btn" data-folder="${escapeHtml(folder)}" title="Delete folder">&times;</button>` : ''}
                </div>`;
            }
            folderDocs.forEach(d => {
                html += `
                    <div class="doc-item ${d.id === currentDocId ? 'active' : ''}" data-id="${d.id}">
                        <span class="doc-item-name">${escapeHtml(d.title)}</span>
                        <span style="display:flex;align-items:center;gap:4px;">
                            <span class="doc-item-meta">${d.word_count}w</span>
                            <button class="doc-delete-btn" data-id="${d.id}" title="Delete">&times;</button>
                        </span>
                    </div>`;
            });
        }
        docList.innerHTML = html;

        docList.querySelectorAll('.doc-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.classList.contains('doc-delete-btn')) return;
                loadDocument(parseInt(el.dataset.id));
            });
        });

        docList.querySelectorAll('.doc-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                if (!confirm('Delete this document?')) return;
                await fetch(`/api/editor/documents/${id}`, { method: 'DELETE' });
                if (currentDocId === id) {
                    currentDocId = null;
                    localStorage.removeItem('piedpiper_last_doc_id');
                    titleInput.value = 'Untitled';
                    quill.setText('');
                }
                loadDocList();
            });
        });

        docList.querySelectorAll('.folder-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const folder = btn.dataset.folder;
                if (!confirm(`Delete folder "${folder}"? Documents will be moved to General.`)) return;
                const allDocs = await Api.get('/api/editor/documents');
                for (const d of allDocs.filter(d => d.folder === folder)) {
                    await fetch(`/api/editor/documents/${d.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folder: 'General' }),
                    });
                }
                if (docFolder.value === folder) docFolder.value = 'General';
                await loadFolders(docFolder.value);
                loadDocList();
            });
        });
    }

    async function loadDocument(id) {
        isLoading = true;
        isDirty = false;
        clearTimeout(saveTimer);

        const doc = await Api.get(`/api/editor/documents/${id}`);
        if (doc.error) { isLoading = false; return; }

        currentDocId = doc.id;
        localStorage.setItem('piedpiper_last_doc_id', String(doc.id));
        titleInput.value = doc.title;
        docFolder.value = doc.folder || 'General';
        quill.root.innerHTML = doc.content_html || '';

        setTimeout(() => {
            isLoading = false;
            saveStatus.textContent = 'Saved';
            saveStatus.style.color = 'var(--success)';
            highlightVocabWords();
        }, 150);

        // Just re-render cached list with new active state (no API call)
        if (cachedDocs) renderDocList(cachedDocs);
    }

    async function saveDocument() {
        if (!currentDocId) return;
        const folderVal = docFolder.value;
        await fetch(`/api/editor/documents/${currentDocId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: titleInput.value.trim() || 'Untitled',
                folder: (folderVal && folderVal !== '__new__') ? folderVal : 'General',
                content_html: quill.root.innerHTML,
                content_text: quill.getText().trim(),
            }),
        });
        localStorage.setItem('piedpiper_last_doc_id', String(currentDocId));
    }

    // New document
    newDocBtn.addEventListener('click', async () => {
        if (currentDocId && !isSaving) await saveDocument();

        isLoading = true;
        clearTimeout(saveTimer);

        const folder = (docFolder.value && docFolder.value !== '__new__') ? docFolder.value : 'General';
        const { ok, data } = await Api.post('/api/editor/documents', { title: 'Untitled', folder });
        if (ok) {
            currentDocId = data.id;
            localStorage.setItem('piedpiper_last_doc_id', String(data.id));
            titleInput.value = data.title;
            docFolder.value = data.folder;
            quill.setText('');

            setTimeout(() => {
                isLoading = false;
                saveStatus.textContent = 'Saved';
                saveStatus.style.color = 'var(--success)';
            }, 100);

            loadDocList();
        } else {
            isLoading = false;
        }
    });

    // --- Init: restore last document ---
    (async () => {
        await loadFolders('General');
        await loadVocabWords();
        const docs = await Api.get('/api/editor/documents');

        if (docs.length === 0) {
            const { ok, data } = await Api.post('/api/editor/documents', { title: 'My first document' });
            if (ok) currentDocId = data.id;
        } else {
            // Restore last edited document from localStorage
            const lastId = parseInt(localStorage.getItem('piedpiper_last_doc_id'));
            const lastDoc = lastId ? docs.find(d => d.id === lastId) : null;
            currentDocId = lastDoc ? lastDoc.id : docs[0].id;
        }

        await loadDocList();
        if (currentDocId) await loadDocument(currentDocId);
    })();

    return {
        destroy() {
            // Save any pending changes before leaving
            clearTimeout(saveTimer);
            if (isDirty && currentDocId && quill) {
                const text = quill.getText().trim();
                // Only save if there's actual content
                if (text.length > 0) {
                    const payload = JSON.stringify({
                        title: titleInput.value.trim() || 'Untitled',
                        folder: (docFolder.value && docFolder.value !== '__new__') ? docFolder.value : 'General',
                        content_html: quill.root.innerHTML,
                        content_text: text,
                    });
                    fetch(`/api/editor/documents/${currentDocId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: payload,
                        keepalive: true,
                    }).catch(() => {});
                }
            }
            if (currentDocId) localStorage.setItem('piedpiper_last_doc_id', String(currentDocId));
            document.removeEventListener('mouseup', handleSelection);
            document.removeEventListener('keyup', handleSelection);
            if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
        }
    };
}
