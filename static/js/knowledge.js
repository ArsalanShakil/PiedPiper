function initKnowledgeView() {
    const fileList = document.getElementById('kb-file-list');
    const fileInput = document.getElementById('kb-file-input');
    const uploadStatus = document.getElementById('kb-upload-status');
    const previewPanel = document.getElementById('kb-preview-panel');
    const previewTitle = document.getElementById('kb-preview-title');
    const previewContent = document.getElementById('kb-preview-content');

    if (!fileList) return {};

    async function loadFiles() {
        const files = await Api.get('/api/knowledge/');
        if (files.length === 0) {
            fileList.innerHTML = '<p class="empty-state">No files in knowledge base.</p>';
            return;
        }

        fileList.innerHTML = files.map(f => `
            <div class="kb-file-item">
                <div class="kb-file-info" onclick="kbPreview('${escapeHtml(f.name)}')">
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
                    <button class="btn btn-small" onclick="kbPreview('${escapeHtml(f.name)}')">Preview</button>
                    ${f.bundled ? '' : `<button class="btn btn-small btn-danger" onclick="kbDelete('${escapeHtml(f.name)}')">Delete</button>`}
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

    // Preview
    window.kbPreview = async function(name) {
        previewPanel.style.display = 'block';
        previewTitle.textContent = name;
        previewContent.textContent = 'Loading...';

        const data = await Api.get(`/api/knowledge/preview?name=${encodeURIComponent(name)}`);
        if (data.error) {
            previewContent.textContent = data.error;
        } else {
            previewContent.textContent = data.content;
            if (data.truncated) {
                previewContent.textContent += `\n\n--- (Showing first 5,000 of ${formatSize(data.full_size)} characters) ---`;
            }
        }
    };

    // Delete
    window.kbDelete = async function(name) {
        if (!confirm(`Delete "${name}"?`)) return;
        const { ok, data } = await Api.post('/api/knowledge/delete', { name });
        if (ok) {
            loadFiles();
            previewPanel.style.display = 'none';
        } else {
            alert(data.error || 'Delete failed');
        }
    };

    // Upload
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;

        uploadStatus.style.display = 'block';
        uploadStatus.textContent = `Uploading ${file.name}...`;
        uploadStatus.className = 'upload-status uploading';

        const formData = new FormData();
        formData.append('file', file);

        const { ok, data } = await Api.upload('/api/knowledge/upload', formData);
        if (ok) {
            uploadStatus.textContent = `Uploaded: ${data.name}`;
            uploadStatus.className = 'upload-status success';
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
