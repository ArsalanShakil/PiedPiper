function initKnowledgeView() {
    const fileList = document.getElementById('kb-file-list');
    const fileInput = document.getElementById('kb-file-input');
    const uploadFolder = document.getElementById('kb-upload-folder');
    const uploadStatus = document.getElementById('kb-upload-status');
    const previewPanel = document.getElementById('kb-preview-panel');
    const previewTitle = document.getElementById('kb-preview-title');
    const previewContent = document.getElementById('kb-preview-content');
    const tabs = document.getElementById('kb-tabs');

    if (!fileList) return {};

    let allFiles = {};
    let activeFolder = 'Writing';

    // Tab switching
    tabs.querySelectorAll('.kb-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.querySelectorAll('.kb-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeFolder = tab.dataset.folder;
            renderFiles();
        });
    });

    async function loadFiles() {
        allFiles = await Api.get('/api/knowledge/');
        renderFiles();
    }

    function renderFiles() {
        const files = allFiles[activeFolder] || [];
        if (files.length === 0) {
            fileList.innerHTML = `<p class="empty-state">No files in ${activeFolder}. Upload some study materials!</p>`;
            return;
        }

        fileList.innerHTML = files.map(f => `
            <div class="kb-file-item">
                <div class="kb-file-info" onclick="kbPreview('${escapeHtml(f.folder)}', '${escapeHtml(f.name)}')">
                    <span class="kb-file-icon">${getFileIcon(f.extension)}</span>
                    <div class="kb-file-details">
                        <span class="kb-file-name">${escapeHtml(f.name)}</span>
                        <span class="kb-file-meta">
                            ${formatSize(f.size)}
                            ${f.bundled ? '<span class="badge badge-bundled">Bundled</span>' : '<span class="badge badge-uploaded">Uploaded</span>'}
                        </span>
                    </div>
                </div>
                <div class="kb-file-actions">
                    <button class="btn btn-small" onclick="kbPreview('${escapeHtml(f.folder)}', '${escapeHtml(f.name)}')">Preview</button>
                    ${f.bundled ? '' : `<button class="btn btn-small btn-danger" onclick="kbDelete('${escapeHtml(f.folder)}', '${escapeHtml(f.name)}')">Delete</button>`}
                </div>
            </div>
        `).join('');
    }

    function getFileIcon(ext) {
        switch (ext) {
            case '.md': return '\uD83D\uDCDD';
            case '.txt': return '\uD83D\uDCC4';
            case '.pdf': return '\uD83D\uDCD5';
            case '.docx': return '\uD83D\uDCD8';
            default: return '\uD83D\uDCC1';
        }
    }

    window.kbPreview = async function(folder, name) {
        previewPanel.style.display = 'block';
        previewTitle.textContent = `${folder} / ${name}`;
        previewContent.textContent = 'Loading...';

        const data = await Api.get(`/api/knowledge/preview?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(name)}`);
        if (data.error) {
            previewContent.textContent = data.error;
        } else {
            previewContent.textContent = data.content;
            if (data.truncated) {
                previewContent.textContent += `\n\n--- (Showing first 5,000 of ${formatSize(data.full_size)} characters) ---`;
            }
        }
    };

    window.kbDelete = async function(folder, name) {
        if (!confirm(`Delete "${name}"?`)) return;
        const { ok, data } = await Api.post('/api/knowledge/delete', { folder, name });
        if (ok) {
            loadFiles();
            previewPanel.style.display = 'none';
        } else {
            alert(data.error || 'Delete failed');
        }
    };

    // Upload — include selected folder
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;

        uploadStatus.style.display = 'block';
        uploadStatus.textContent = `Uploading ${file.name} to ${uploadFolder.value}...`;
        uploadStatus.className = 'upload-status uploading';

        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', uploadFolder.value);

        const { ok, data } = await Api.upload('/api/knowledge/upload', formData);
        if (ok) {
            uploadStatus.textContent = `Uploaded: ${data.name} to ${data.folder}`;
            uploadStatus.className = 'upload-status success';
            // Switch to the folder where file was uploaded
            activeFolder = data.folder;
            tabs.querySelectorAll('.kb-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.folder === activeFolder);
            });
            loadFiles();
        } else {
            uploadStatus.textContent = data.error || 'Upload failed';
            uploadStatus.className = 'upload-status error';
        }

        fileInput.value = '';
        setTimeout(() => { uploadStatus.style.display = 'none'; }, 3000);
    });

    loadFiles();
    return { destroy() {} };
}
