function initEditorView() {
    let quill = null;
    let currentDocId = null;
    let saveTimer = null;
    let lastTranslation = null;

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

    // Auto-save on text change
    quill.on('text-change', () => {
        const text = quill.getText().trim();
        const words = text ? text.split(/\s+/).length : 0;
        wordCount.textContent = words + ' words';
        triggerAutoSave();
    });

    titleInput.addEventListener('input', triggerAutoSave);

    docFolder.addEventListener('change', () => {
        triggerAutoSave();
        loadFolders();
    });

    function triggerAutoSave() {
        saveStatus.textContent = 'Saving...';
        saveStatus.style.color = 'var(--text-light)';
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
            await saveDocument();
            saveStatus.textContent = 'Auto-saved';
            saveStatus.style.color = 'var(--success)';
        }, 800);
    }

    // --- Folders ---
    async function loadFolders() {
        const folders = await Api.get('/api/editor/folders');
        const opts = folders.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');
        docFolder.innerHTML = opts + '<option value="__new__">+ New folder...</option>';
        folderFilter.innerHTML = '<option value="">All Folders</option>' + opts;

        // Restore selection
        if (currentDocId) {
            const doc = await Api.get(`/api/editor/documents/${currentDocId}`);
            if (doc && doc.folder) docFolder.value = doc.folder;
        }

        // Handle "new folder" selection
        docFolder.addEventListener('change', function handler() {
            if (docFolder.value === '__new__') {
                const name = prompt('New folder name:');
                if (name && name.trim()) {
                    const opt = document.createElement('option');
                    opt.value = name.trim();
                    opt.textContent = name.trim();
                    docFolder.insertBefore(opt, docFolder.lastElementChild);
                    docFolder.value = name.trim();
                    triggerAutoSave();
                } else {
                    docFolder.value = 'General';
                }
            }
        });
    }

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
            data.word_by_word.forEach(w => {
                html += `<div class="word-pair"><span class="word-sv">${escapeHtml(w.sv)}</span><span class="word-en">${escapeHtml(w.en)}</span></div>`;
            });
            html += '</div>';
        }
        if (data.grammar_notes) {
            html += `<div class="trans-grammar">${escapeHtml(data.grammar_notes)}</div>`;
        }
        transBody.innerHTML = html;
        transActions.style.display = 'flex';
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
    async function loadDocList() {
        const docs = await Api.get('/api/editor/documents');
        const filterVal = folderFilter.value;
        const filtered = filterVal ? docs.filter(d => d.folder === filterVal) : docs;

        if (filtered.length === 0) {
            docList.innerHTML = '<p style="padding:12px;color:var(--text-light);font-size:13px;">No documents</p>';
            return;
        }

        // Group by folder
        const grouped = {};
        filtered.forEach(d => {
            const f = d.folder || 'General';
            if (!grouped[f]) grouped[f] = [];
            grouped[f].push(d);
        });

        let html = '';
        for (const [folder, docs] of Object.entries(grouped)) {
            if (!filterVal) {
                html += `<div style="padding:6px 12px 2px;font-size:11px;color:var(--text-light);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(folder)}</div>`;
            }
            docs.forEach(d => {
                html += `
                    <div class="doc-item ${d.id === currentDocId ? 'active' : ''}" data-id="${d.id}">
                        <span class="doc-item-name">${escapeHtml(d.title)}</span>
                        <span class="doc-item-meta">${d.word_count}w</span>
                    </div>`;
            });
        }
        docList.innerHTML = html;

        docList.querySelectorAll('.doc-item').forEach(el => {
            el.addEventListener('click', () => loadDocument(parseInt(el.dataset.id)));
        });
    }

    async function loadDocument(id) {
        // Save current doc first
        if (currentDocId) await saveDocument();

        const doc = await Api.get(`/api/editor/documents/${id}`);
        if (doc.error) return;
        currentDocId = doc.id;
        titleInput.value = doc.title;
        docFolder.value = doc.folder || 'General';
        quill.root.innerHTML = doc.content_html || '';
        saveStatus.textContent = 'Auto-saved';
        saveStatus.style.color = 'var(--success)';
        loadDocList();
    }

    async function saveDocument() {
        if (!currentDocId) return;
        await fetch(`/api/editor/documents/${currentDocId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: titleInput.value || 'Untitled',
                folder: docFolder.value === '__new__' ? 'General' : docFolder.value,
                content_html: quill.root.innerHTML,
                content_text: quill.getText().trim(),
            }),
        });
    }

    // New document
    newDocBtn.addEventListener('click', async () => {
        if (currentDocId) await saveDocument();
        const folder = docFolder.value === '__new__' ? 'General' : (docFolder.value || 'General');
        const { ok, data } = await Api.post('/api/editor/documents', { title: 'Untitled', folder });
        if (ok) {
            currentDocId = data.id;
            titleInput.value = data.title;
            docFolder.value = data.folder;
            quill.setText('');
            saveStatus.textContent = 'Auto-saved';
            saveStatus.style.color = 'var(--success)';
            loadDocList();
        }
    });

    // --- Init ---
    (async () => {
        await loadFolders();
        const docs = await Api.get('/api/editor/documents');
        if (docs.length === 0) {
            const { ok, data } = await Api.post('/api/editor/documents', { title: 'My first document' });
            if (ok) currentDocId = data.id;
        } else {
            currentDocId = docs[0].id;
        }
        await loadDocList();
        if (currentDocId) await loadDocument(currentDocId);
    })();

    return {
        destroy() {
            clearTimeout(saveTimer);
            if (currentDocId) saveDocument();
            document.removeEventListener('mouseup', handleSelection);
            document.removeEventListener('keyup', handleSelection);
        }
    };
}
