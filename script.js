const API_BASE_URL = 'https://backend-rag-model.onrender.com';

document.addEventListener('DOMContentLoaded', () => {
    initAnimations();
    initStatsCounters();
    initSearch();
    initModal();
    initUpload();
});

/* =========================================
   Animations
   ========================================= */
function initAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.animate-up').forEach(el => observer.observe(el));
}

function initStatsCounters() {
    const counters = document.querySelectorAll('.stat-number[data-target]');
    
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;
                const targetValue = parseInt(target.getAttribute('data-target'));
                const duration = 2000; // ms
                const steps = 60;
                const stepTime = duration / steps;
                let current = 0;
                
                const timer = setInterval(() => {
                    current += Math.ceil(targetValue / steps);
                    if (current >= targetValue) {
                        target.innerText = targetValue;
                        clearInterval(timer);
                    } else {
                        target.innerText = current;
                    }
                }, stepTime);
                
                obs.unobserve(target);
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(counter => observer.observe(counter));
}

/* =========================================
   Search Integration (/ask)
   ========================================= */
function initSearch() {
    const form = document.getElementById('askForm');
    const input = document.getElementById('questionInput');
    const btn = document.getElementById('searchBtn');
    const resultContainer = document.getElementById('resultContainer');
    const answerContent = document.getElementById('answerContent');
    const sourcesContainer = document.getElementById('sourcesContainer');
    const sourcesList = document.getElementById('sourcesList');

    // Handle Example Tags
    document.querySelectorAll('.example-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            input.value = tag.innerText;
            form.dispatchEvent(new Event('submit'));
        });
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const question = input.value.trim();
        if (!question) return;

        // UI Loading State
        btn.classList.add('loading');
        btn.disabled = true;
        resultContainer.classList.remove('hidden');
        sourcesContainer.classList.add('hidden');
        
        answerContent.innerHTML = `
            <div class="skeleton-line"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line"></div>
        `;

        try {
            const response = await fetch(`${API_BASE_URL}/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to analyze question.');
            }

            // Render Answer
            answerContent.innerText = data.answer;

            // Render Sources
            if (data.sources && data.sources.length > 0) {
                sourcesList.innerHTML = '';
                const uniqueSources = [...new Set(data.sources.map(s => s.filename))];
                uniqueSources.forEach(src => {
                    const li = document.createElement('li');
                    li.innerText = src;
                    sourcesList.appendChild(li);
                });
                sourcesContainer.classList.remove('hidden');
            }

        } catch (error) {
            answerContent.innerHTML = `<span style="color: #f87171;">Error: ${error.message}</span>`;
        } finally {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    });
}

/* =========================================
   Modal & Documents Integration (/documents)
   ========================================= */
function initModal() {
    const modal = document.getElementById('adminModal');
    const openBtn = document.getElementById('adminBtn');
    const footerOpenBtn = document.getElementById('footerAdminBtn');
    const closeBtn = document.getElementById('closeModalBtn');
    const refreshBtn = document.getElementById('refreshDocsBtn');

    const openModal = () => {
        modal.classList.add('active');
        fetchDocuments();
    };

    const closeModal = () => modal.classList.remove('active');

    openBtn.addEventListener('click', openModal);
    footerOpenBtn.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
    closeBtn.addEventListener('click', closeModal);
    refreshBtn.addEventListener('click', fetchDocuments);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

async function fetchDocuments() {
    const tableBody = document.getElementById('docsTableBody');
    const loading = document.getElementById('docsLoading');
    
    tableBody.innerHTML = '';
    loading.classList.remove('hidden');

    try {
        const response = await fetch(`${API_BASE_URL}/documents`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Failed to fetch documents.');

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="2" style="text-align: center; color: var(--text-secondary);">No documents indexed yet.</td></tr>`;
        } else {
            data.forEach(doc => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${doc.filename}</td>
                    <td><span class="example-tag" style="margin:0">${doc.chunkCount} chunks</span></td>
                `;
                tableBody.appendChild(tr);
            });
        }
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="2" style="color: #f87171;">Error: ${error.message}</td></tr>`;
    } finally {
        loading.classList.add('hidden');
    }
}

/* =========================================
   Upload Integration (/upload)
   ========================================= */
function initUpload() {
    const form = document.getElementById('uploadForm');
    const fileInput = document.getElementById('fileInput');
    const btn = document.getElementById('uploadBtn');
    const status = document.getElementById('uploadStatus');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const file = fileInput.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        // UI Loading State
        btn.classList.add('loading');
        btn.disabled = true;
        status.className = 'status-message';
        status.innerText = 'Uploading and indexing document... This may take a moment.';

        try {
            const response = await fetch(`${API_BASE_URL}/upload`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Upload failed.');

            status.classList.add('status-success');
            status.innerText = `Success: ${data.message} (${data.chunksCount} chunks)`;
            fileInput.value = ''; // Reset
            
            // Refresh documents table
            fetchDocuments();

        } catch (error) {
            status.classList.add('status-error');
            status.innerText = `Error: ${error.message}`;
        } finally {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    });
}
