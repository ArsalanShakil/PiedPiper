function initVocabularyView() {
    const listView = document.getElementById('vocab-list-view');
    const reviewView = document.getElementById('vocab-review-view');
    const vocabList = document.getElementById('vocab-list');
    const searchInput = document.getElementById('vocab-search-input');
    const categoryFilter = document.getElementById('vocab-category-filter');
    const reviewBtn = document.getElementById('vocab-review-btn');
    const backBtn = document.getElementById('vocab-back-btn');
    const exportBtn = document.getElementById('vocab-export-btn');
    const reviewContent = document.getElementById('vocab-review-content');

    if (!vocabList) return {};

    let reviewItems = [];
    let reviewIndex = 0;
    let reviewScore = 0;

    async function loadVocab() {
        const search = searchInput.value.trim();
        const category = categoryFilter.value;
        let url = '/api/vocabulary/?';
        if (search) url += `search=${encodeURIComponent(search)}&`;
        if (category) url += `category=${encodeURIComponent(category)}`;

        const items = await Api.get(url);

        if (items.length === 0) {
            vocabList.innerHTML = '<p class="empty-state">No vocabulary yet. Save words from the Writing Editor!</p>';
            return;
        }

        vocabList.innerHTML = items.map(v => `
            <div class="vocab-item">
                <span class="vocab-sv">${escapeHtml(v.swedish_text)}</span>
                <span class="vocab-en">${escapeHtml(v.translation)}</span>
                <div class="vocab-meta">
                    <div class="difficulty-dots">
                        ${[0,1,2,3,4].map(i => `<div class="difficulty-dot ${i < v.difficulty ? 'filled' : ''}"></div>`).join('')}
                    </div>
                    <button class="btn btn-small btn-danger" onclick="vocabDelete(${v.id})">Delete</button>
                </div>
            </div>
        `).join('');
    }

    async function loadCategories() {
        const cats = await Api.get('/api/vocabulary/categories');
        categoryFilter.innerHTML = '<option value="">All Categories</option>' +
            cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    }

    window.vocabDelete = async function(id) {
        if (!confirm('Delete this word?')) return;
        await fetch(`/api/vocabulary/${id}`, { method: 'DELETE' });
        loadVocab();
    };

    searchInput.addEventListener('input', () => { clearTimeout(searchInput._t); searchInput._t = setTimeout(loadVocab, 300); });
    categoryFilter.addEventListener('change', loadVocab);

    exportBtn.addEventListener('click', () => {
        window.open('/api/vocabulary/export', '_blank');
    });

    // Flashcard Review
    reviewBtn.addEventListener('click', async () => {
        reviewItems = await Api.get('/api/vocabulary/review?limit=20');
        if (reviewItems.length === 0) {
            alert('No vocabulary to review. Add some words first!');
            return;
        }
        reviewIndex = 0;
        reviewScore = 0;
        listView.style.display = 'none';
        reviewView.style.display = 'block';
        showFlashcard();
    });

    backBtn.addEventListener('click', () => {
        reviewView.style.display = 'none';
        listView.style.display = 'block';
        loadVocab();
    });

    function showFlashcard() {
        if (reviewIndex >= reviewItems.length) {
            reviewContent.innerHTML = `
                <div class="review-complete">
                    <h3>Review Complete!</h3>
                    <p>You got ${reviewScore} out of ${reviewItems.length} correct.</p>
                    <button class="btn btn-primary" style="width:auto;" onclick="document.getElementById('vocab-back-btn').click()">Back to List</button>
                </div>`;
            return;
        }

        const item = reviewItems[reviewIndex];
        reviewContent.innerHTML = `
            <div class="flashcard" id="fc-card">
                <div class="flashcard-word">${escapeHtml(item.swedish_text)}</div>
                <div class="flashcard-hint">Click to reveal translation</div>
                <div class="flashcard-answer" id="fc-answer">${escapeHtml(item.translation)}</div>
                ${item.context ? `<div class="flashcard-grammar" id="fc-context">${escapeHtml(item.context)}</div>` : ''}
            </div>
            <div class="flashcard-buttons" id="fc-buttons" style="display:none;">
                <button class="btn btn-danger" id="fc-wrong" style="min-width:120px;">Didn't know</button>
                <button class="btn btn-primary" id="fc-right" style="width:auto;min-width:120px;">Knew it!</button>
            </div>
            <div class="flashcard-progress">${reviewIndex + 1} / ${reviewItems.length}</div>`;

        document.getElementById('fc-card').addEventListener('click', () => {
            document.getElementById('fc-answer').classList.add('revealed');
            const ctx = document.getElementById('fc-context');
            if (ctx) ctx.classList.add('revealed');
            document.querySelector('.flashcard-hint').style.display = 'none';
            document.getElementById('fc-buttons').style.display = 'flex';
        });

        document.getElementById('fc-right').addEventListener('click', async () => {
            reviewScore++;
            await Api.post(`/api/vocabulary/review/${item.id}`, { knew_it: true });
            reviewIndex++;
            showFlashcard();
        });

        document.getElementById('fc-wrong').addEventListener('click', async () => {
            await Api.post(`/api/vocabulary/review/${item.id}`, { knew_it: false });
            reviewIndex++;
            showFlashcard();
        });
    }

    loadVocab();
    loadCategories();
    return { destroy() {} };
}
