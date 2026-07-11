const API_BASE_URL = 'http://localhost:5000';

// Global Application State
let token = localStorage.getItem('token') || null;
let currentUser = null;
let chatHistory = [];
let userAttempts = []; // Cache list of quiz attempts
let activeQuizId = null;
let activeQuizQuestions = [];
let currentAnswers = [];
let currentQuestionIndex = 0;
let tempPhoneForLogin = '';
let activeSessionId = localStorage.getItem('sessionId') || null;

document.addEventListener('DOMContentLoaded', async () => {
    initAnimations();
    initStatsCounters();
    initModal();
    initUpload();

    // Initialize our interactive components
    initAuth();
    initTabs();
    initChat();
    initQuiz();
    initProfileDrawer(); // Initialize the left-side drawer sub-panel slides

    // Auto-login if token is cached
    if (token) {
        await verifyAndLoadUser();
    } else {
        updateUIState(false);
    }
});

/* =========================================
   Utility Helpers
   ========================================= */
function getHeaders(contentType = 'application/json') {
    const headers = {};
    if (contentType) {
        headers['Content-Type'] = contentType;
    }
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

function ensureActiveSession() {
    if (!activeSessionId) {
        activeSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('sessionId', activeSessionId);
    }
    return activeSessionId;
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function getUserInitials(name) {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
        return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function closeProfileDrawer() {
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');
    const profileSidebar = document.getElementById('profileSidebar');
    if (sidebarBackdrop && profileSidebar) {
        sidebarBackdrop.classList.remove('active');
        profileSidebar.classList.remove('active');
        setTimeout(() => {
            if (!profileSidebar.classList.contains('active')) {
                sidebarBackdrop.classList.add('hidden');
            }
        }, 300);
    }
}

/* =========================================
   Animations & Counters (Preserved)
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
   Authentication Integration
   ========================================= */
function initAuth() {
    const loginTabBtn = document.getElementById('loginTabBtn');
    const registerTabBtn = document.getElementById('registerTabBtn');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const otpForm = document.getElementById('otpForm');
    const otpBackBtn = document.getElementById('otpBackBtn');
    const authStatus = document.getElementById('authStatus');
    const navHomeLink = document.getElementById('navHomeLink');

    // Left profile drawer triggers
    const profileChip = document.getElementById('profileChip');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');
    const profileSidebar = document.getElementById('profileSidebar');

    const openDrawer = () => {
        if (!token) return;
        // Slide track back to main overview first
        document.getElementById('sidebarTrack').style.transform = 'translateX(0)';
        // Reset active menu indicators
        document.querySelectorAll('.sidebar-menu .menu-item').forEach(li => li.classList.remove('active'));

        sidebarBackdrop.classList.add('active');
        profileSidebar.classList.add('active');
        sidebarBackdrop.classList.remove('hidden');
    };

    profileChip.addEventListener('click', openDrawer);
    sidebarBackdrop.addEventListener('click', closeProfileDrawer);

    // Sidebar logout click
    document.getElementById('sidebarLogoutBtn').addEventListener('click', () => {
        closeProfileDrawer();
        logout();
    });

    // Switch to Login Tab
    loginTabBtn.addEventListener('click', () => {
        loginTabBtn.classList.add('active');
        registerTabBtn.classList.remove('active');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        otpForm.classList.add('hidden');
        document.querySelector('.auth-tabs').classList.remove('hidden');
        authStatus.className = 'status-message';
        authStatus.innerText = '';
    });

    // Switch to Register Tab
    registerTabBtn.addEventListener('click', () => {
        registerTabBtn.classList.add('active');
        loginTabBtn.classList.remove('active');
        registerForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
        otpForm.classList.add('hidden');
        document.querySelector('.auth-tabs').classList.remove('hidden');
        authStatus.className = 'status-message';
        authStatus.innerText = '';
    });

    // Login Form Submit
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const countryCode = document.getElementById('loginCountryCode').value;
        let phoneNumberInput = document.getElementById('loginPhone').value.trim();
        if (!phoneNumberInput) return;

        // Strip leading plus, spaces or dashes if user manually typed them anyway
        phoneNumberInput = phoneNumberInput.replace(/^\+/, '').replace(/[\s-]/g, '');
        const phoneNumber = countryCode + phoneNumberInput;

        const submitBtn = document.getElementById('loginSubmitBtn');
        setLoadingState(submitBtn, true);
        authStatus.className = 'status-message';
        authStatus.innerText = '';

        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to request login OTP.');
            }

            // Move to OTP screen
            tempPhoneForLogin = phoneNumber;
            document.querySelector('.auth-tabs').classList.add('hidden');
            loginForm.classList.add('hidden');
            otpForm.classList.remove('hidden');
            authStatus.className = 'status-message status-success';
            authStatus.innerText = 'Success: ' + data.message;
            document.getElementById('otpInput').focus();

        } catch (error) {
            authStatus.className = 'status-message status-error';
            authStatus.innerText = error.message;
        } finally {
            setLoadingState(submitBtn, false);
        }
    });

    // Register Form Submit
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('registerName').value.trim();
        const countryCode = document.getElementById('registerCountryCode').value;
        let phoneNumberInput = document.getElementById('registerPhone').value.trim();

        if (!name || !phoneNumberInput) return;

        // Strip leading plus, spaces or dashes
        phoneNumberInput = phoneNumberInput.replace(/^\+/, '').replace(/[\s-]/g, '');
        const phoneNumber = countryCode + phoneNumberInput;

        const submitBtn = document.getElementById('registerSubmitBtn');
        setLoadingState(submitBtn, true);
        authStatus.className = 'status-message';
        authStatus.innerText = '';

        try {
            const response = await fetch(`${API_BASE_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phoneNumber })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to register account.');
            }

            authStatus.className = 'status-message status-success';
            authStatus.innerText = `Registered! ${data.message}`;

            // Switch to Login Tab and pre-fill phone number
            setTimeout(() => {
                const options = Array.from(document.getElementById('loginCountryCode').options).map(o => o.value);
                options.sort((a, b) => b.length - a.length);
                let matchedCode = "+1";
                let remainingNumber = phoneNumber;
                for (const code of options) {
                    if (phoneNumber.startsWith(code)) {
                        matchedCode = code;
                        remainingNumber = phoneNumber.substring(code.length);
                        break;
                    }
                }

                document.getElementById('loginCountryCode').value = matchedCode;
                document.getElementById('loginPhone').value = remainingNumber;
                loginTabBtn.click();
                authStatus.className = 'status-message status-success';
                authStatus.innerText = 'Account created. Please request login OTP below.';
            }, 1500);

        } catch (error) {
            authStatus.className = 'status-message status-error';
            authStatus.innerText = error.message;
        } finally {
            setLoadingState(submitBtn, false);
        }
    });

    // OTP Form Submit (Verify OTP)
    otpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const otp = document.getElementById('otpInput').value.trim();
        if (!otp || !tempPhoneForLogin) return;

        const submitBtn = document.getElementById('otpSubmitBtn');
        setLoadingState(submitBtn, true);
        authStatus.className = 'status-message';
        authStatus.innerText = '';

        try {
            const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber: tempPhoneForLogin, otp })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'OTP verification failed.');
            }

            // Cache token and set current user
            token = data.token;
            currentUser = data.user;
            localStorage.setItem('token', token);
            tempPhoneForLogin = '';

            // Clean form
            document.getElementById('otpInput').value = '';
            document.getElementById('loginPhone').value = '';
            document.getElementById('registerName').value = '';
            document.getElementById('registerPhone').value = '';

            // Load user profile and attempts, then transition to dashboard
            await verifyAndLoadUser();

        } catch (error) {
            authStatus.className = 'status-message status-error';
            authStatus.innerText = error.message;
        } finally {
            setLoadingState(submitBtn, false);
        }
    });

    // OTP Back Button Click
    otpBackBtn.addEventListener('click', () => {
        document.querySelector('.auth-tabs').classList.remove('hidden');
        loginForm.classList.remove('hidden');
        otpForm.classList.add('hidden');
        authStatus.className = 'status-message';
        authStatus.innerText = '';
    });

    // Home Navbar Link click
    navHomeLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (token) {
            switchTab('chat');
        }
    });
}

async function verifyAndLoadUser() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/profile`, {
            method: 'GET',
            headers: getHeaders()
        });
        const data = await response.json();

        if (response.ok) {
            currentUser = data.user;
            userAttempts = data.attempts || [];
            updateUIState(true);
            switchTab('chat');
            await loadPreviousChatHistory();
        } else {
            logout();
        }
    } catch (error) {
        console.error("Token verification failed:", error);
        logout();
    }
}

function displaySelectedChatSession(session) {
    if (!session) return;

    activeSessionId = session.sessionId;
    localStorage.setItem('sessionId', session.sessionId);

    const chatHistoryEl = document.getElementById('chatHistory');
    chatHistoryEl.innerHTML = '';

    chatHistory = [];
    session.messages.forEach(msg => {
        chatHistory.push({ role: 'user', content: msg.question });
        chatHistory.push({ role: 'assistant', content: msg.answer });

        appendMessage('user', msg.question, null, false, msg._id);
        appendMessage('assistant', msg.answer, null, false, msg._id);
    });

    // Scroll to bottom
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

async function loadPreviousChatHistory() {
    try {
        const response = await fetch(`${API_BASE_URL}/ask/history`, {
            method: 'GET',
            headers: getHeaders()
        });
        const data = await response.json();
        if (response.ok && data && data.length > 0) {
            displaySelectedChatSession(data[0]);
        }
    } catch (err) {
        console.error("Failed to load previous chat history:", err);
    }
}

async function refreshProfileData() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/profile`, {
            method: 'GET',
            headers: getHeaders()
        });
        const data = await response.json();
        if (response.ok) {
            currentUser = data.user;
            userAttempts = data.attempts || [];

            // Re-render UI initials and drawer details
            const initialsEl = document.getElementById('navUserInitials');
            if (initialsEl) initialsEl.innerText = getUserInitials(currentUser.name);
            updateProfileDrawerUI();
        }
    } catch (error) {
        console.error("Failed to refresh profile data:", error);
    }
}

function updateUIState(isLoggedIn) {
    const authSection = document.getElementById('authSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const navUserInfo = document.getElementById('navUserInfo');
    const initialsEl = document.getElementById('navUserInitials');

    if (isLoggedIn && currentUser) {
        authSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
        navUserInfo.classList.remove('hidden');
        if (initialsEl) initialsEl.innerText = getUserInitials(currentUser.name);

        // Refresh sidebar view details
        updateProfileDrawerUI();
    } else {
        authSection.classList.remove('hidden');
        dashboardSection.classList.add('hidden');
        navUserInfo.classList.add('hidden');

        // Close profile drawer if open
        document.getElementById('profileSidebar').classList.remove('active');
        document.getElementById('sidebarBackdrop').classList.remove('active');
        document.getElementById('sidebarBackdrop').classList.add('hidden');

        // Show login state by default
        document.getElementById('loginTabBtn').click();
    }
}

function logout() {
    token = null;
    currentUser = null;
    userAttempts = [];
    localStorage.removeItem('token');
    localStorage.removeItem('sessionId');
    activeSessionId = null;
    chatHistory = [];

    // Reset Chat panel to default greet
    const chatHistoryEl = document.getElementById('chatHistory');
    chatHistoryEl.innerHTML = `
        <div class="message message-bot">
            <div class="message-bubble">
                Hello! I am your AI Cricket Intelligence Assistant. Ask me anything about cricket and I'll retrieve answers from our knowledge base documents.
            </div>
        </div>
    `;

    resetQuizUI();
    updateUIState(false);
}

function setLoadingState(buttonEl, isLoading) {
    if (isLoading) {
        buttonEl.classList.add('loading');
        buttonEl.disabled = true;
    } else {
        buttonEl.classList.remove('loading');
        buttonEl.disabled = false;
    }
}

/* =========================================
   Dashboard Tab Switcher
   ========================================= */
function initTabs() {
    const tabChatBtn = document.getElementById('tabChatBtn');
    const tabQuizBtn = document.getElementById('tabQuizBtn');

    tabChatBtn.addEventListener('click', () => switchTab('chat'));
    tabQuizBtn.addEventListener('click', () => switchTab('quiz'));
}

function switchTab(tabName) {
    const tabChatBtn = document.getElementById('tabChatBtn');
    const tabQuizBtn = document.getElementById('tabQuizBtn');

    const chatPanel = document.getElementById('chatPanel');
    const quizPanel = document.getElementById('quizPanel');

    // Deactivate all
    [tabChatBtn, tabQuizBtn].forEach(b => b.classList.remove('active'));
    [chatPanel, quizPanel].forEach(p => p.classList.remove('active'));

    if (tabName === 'chat') {
        tabChatBtn.classList.add('active');
        chatPanel.classList.add('active');
    } else if (tabName === 'quiz') {
        tabQuizBtn.classList.add('active');
        quizPanel.classList.add('active');
        if (activeQuizQuestions.length === 0) {
            resetQuizUI();
        }
    }
}

/* =========================================
   Chatbot Integration (/ask)
   ========================================= */
function initChat() {
    const form = document.getElementById('askForm');
    const input = document.getElementById('questionInput');
    const btn = document.getElementById('searchBtn');
    const newChatBtn = document.getElementById('newChatBtn');

    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            localStorage.removeItem('sessionId');
            activeSessionId = null;
            chatHistory = [];

            const chatHistoryEl = document.getElementById('chatHistory');
            chatHistoryEl.innerHTML = `
                <div class="message message-bot">
                    <div class="message-bubble">
                        Hello! I am your AI Cricket Intelligence Assistant. Ask me anything about cricket and I'll retrieve answers from our knowledge base documents.
                    </div>
                </div>
            `;
            ensureActiveSession();
        });
    }

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

        // Reset input immediately
        input.value = '';

        // Render User message
        const userMsgEl = appendMessage('user', question);

        // UI Loading State
        btn.classList.add('loading');
        btn.disabled = true;
        input.disabled = true;

        const loadingId = appendLoadingBubble();

        try {
            const response = await fetch(`${API_BASE_URL}/ask`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({
                    question,
                    history: chatHistory,
                    sessionId: ensureActiveSession()
                })
            });

            const data = await response.json();
            removeLoadingBubble(loadingId);

            if (!response.ok) {
                throw new Error(data.error || 'Failed to analyze question.');
            }

            // Render Bot response
            appendMessage('assistant', data.answer, data.sources, false, data.historyId);

            // Link user message element to historyId
            if (data.historyId && userMsgEl) {
                userMsgEl.setAttribute('data-msg-id', data.historyId);
            }

            // Record conversation context in chatHistory
            chatHistory.push({ role: 'user', content: question });
            chatHistory.push({ role: 'assistant', content: data.answer });

        } catch (error) {
            removeLoadingBubble(loadingId);
            appendMessage('assistant', `Error: ${error.message}`, null, true);
        } finally {
            btn.classList.remove('loading');
            btn.disabled = false;
            input.disabled = false;
            input.focus();
        }
    });
}

function appendMessage(role, text, sources = null, isError = false, msgId = null) {
    const chatHistoryEl = document.getElementById('chatHistory');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message message-${role === 'user' ? 'user' : 'bot'}`;
    if (msgId) {
        msgDiv.setAttribute('data-msg-id', msgId);
    }

    let contentHtml = `<div class="message-bubble" ${isError ? 'style="color: #f87171;"' : ''}>${escapeHTML(text)}`;

    if (sources && sources.length > 0) {
        const uniqueSources = [...new Set(sources.map(s => s.filename))];
        contentHtml += `<div class="citations">Sources: `;
        uniqueSources.forEach(src => {
            contentHtml += `<span>📄 ${escapeHTML(src)}</span>`;
        });
        contentHtml += `</div>`;
    }
    contentHtml += `</div>`;

    msgDiv.innerHTML = contentHtml;
    chatHistoryEl.appendChild(msgDiv);
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
    return msgDiv;
}

let loadingCounter = 0;
function appendLoadingBubble() {
    const chatHistoryEl = document.getElementById('chatHistory');
    const msgDiv = document.createElement('div');
    const id = `loading-${loadingCounter++}`;
    msgDiv.id = id;
    msgDiv.className = 'message message-bot';
    msgDiv.innerHTML = `
        <div class="message-bubble">
            <div class="skeleton-line" style="width: 200px;"></div>
            <div class="skeleton-line" style="width: 140px;"></div>
            <div class="skeleton-line" style="width: 170px;"></div>
        </div>
    `;
    chatHistoryEl.appendChild(msgDiv);
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
    return id;
}

function removeLoadingBubble(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

/* =========================================
   Personalized Quiz Integration
   ========================================= */
function initQuiz() {
    const startQuizBtn = document.getElementById('startQuizBtn');
    const quizPrevBtn = document.getElementById('quizPrevBtn');
    const quizNextBtn = document.getElementById('quizNextBtn');
    const quizSubmitBtn = document.getElementById('quizSubmitBtn');
    const quizRetryBtn = document.getElementById('quizRetryBtn');
    const quizBackToChatBtn = document.getElementById('quizBackToChatBtn');

    startQuizBtn.addEventListener('click', startQuiz);
    quizPrevBtn.addEventListener('click', prevQuestion);
    quizNextBtn.addEventListener('click', nextQuestion);
    quizSubmitBtn.addEventListener('click', submitQuiz);
    quizRetryBtn.addEventListener('click', startQuiz);
    quizBackToChatBtn.addEventListener('click', () => switchTab('chat'));
}

function resetQuizUI() {
    activeQuizId = null;
    activeQuizQuestions = [];
    currentAnswers = [];
    currentQuestionIndex = 0;

    document.getElementById('quizIntro').classList.remove('hidden');
    document.getElementById('quizLoading').classList.add('hidden');
    document.getElementById('quizPlay').classList.add('hidden');
    document.getElementById('quizResults').classList.add('hidden');

    const introStatus = document.getElementById('quizIntroStatus');
    introStatus.className = 'status-message';
    introStatus.innerText = '';
}

async function startQuiz() {
    const quizIntro = document.getElementById('quizIntro');
    const quizLoading = document.getElementById('quizLoading');
    const introStatus = document.getElementById('quizIntroStatus');

    introStatus.className = 'status-message';
    introStatus.innerText = '';
    quizIntro.classList.add('hidden');
    quizLoading.classList.remove('hidden');

    try {
        const response = await fetch(`${API_BASE_URL}/quiz/active`, {
            method: 'GET',
            headers: getHeaders()
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to retrieve active quiz.');
        }

        activeQuizId = data.quizId;
        activeQuizQuestions = data.questions;
        currentAnswers = Array(activeQuizQuestions.length).fill(null);
        currentQuestionIndex = 0;

        quizLoading.classList.add('hidden');
        document.getElementById('quizPlay').classList.remove('hidden');

        renderQuizQuestion();

    } catch (error) {
        quizLoading.classList.add('hidden');
        quizIntro.classList.remove('hidden');
        introStatus.className = 'status-message status-error';
        introStatus.innerText = error.message;
    }
}

function renderQuizQuestion() {
    if (activeQuizQuestions.length === 0) return;

    const totalQuestions = activeQuizQuestions.length;
    const currentQ = activeQuizQuestions[currentQuestionIndex];

    // Progress Bar
    const progressPercent = ((currentQuestionIndex) / totalQuestions) * 100;
    document.querySelector('.quiz-progress-fill').style.width = `${progressPercent}%`;

    // Question Labels
    document.getElementById('quizQuestionNum').innerText = `Question ${currentQuestionIndex + 1} of ${totalQuestions}`;
    document.getElementById('quizQuestionText').innerText = currentQ.questionText;

    // Options Container
    const optionsContainer = document.getElementById('quizOptionsContainer');
    optionsContainer.innerHTML = '';

    currentQ.options.forEach((opt, idx) => {
        const optionCard = document.createElement('div');
        optionCard.className = 'option-card';
        if (currentAnswers[currentQuestionIndex] === idx) {
            optionCard.classList.add('selected');
        }

        optionCard.innerText = opt;
        optionCard.addEventListener('click', () => {
            currentAnswers[currentQuestionIndex] = idx;
            renderQuizQuestion(); // update selected state visually
        });

        optionsContainer.appendChild(optionCard);
    });

    // Control buttons visibility
    const prevBtn = document.getElementById('quizPrevBtn');
    const nextBtn = document.getElementById('quizNextBtn');
    const submitBtn = document.getElementById('quizSubmitBtn');

    prevBtn.disabled = currentQuestionIndex === 0;

    if (currentQuestionIndex === totalQuestions - 1) {
        nextBtn.classList.add('hidden');
        submitBtn.classList.remove('hidden');
    } else {
        nextBtn.classList.remove('hidden');
        submitBtn.classList.add('hidden');
    }
}

function nextQuestion() {
    if (currentQuestionIndex < activeQuizQuestions.length - 1) {
        currentQuestionIndex++;
        renderQuizQuestion();
    }
}

function prevQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderQuizQuestion();
    }
}

async function submitQuiz() {
    const submitBtn = document.getElementById('quizSubmitBtn');
    const prevBtn = document.getElementById('quizPrevBtn');

    // Submit request payload matches swagger schemas
    const formattedAnswers = activeQuizQuestions.map((q, idx) => ({
        questionId: q._id,
        selectedOptionIndex: currentAnswers[idx] !== null ? currentAnswers[idx] : 0
    }));

    setLoadingState(submitBtn, true);
    prevBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/quiz/submit`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                quizId: activeQuizId,
                answers: formattedAnswers
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to submit quiz answers.');
        }

        // Render Results Dashboard Tab
        document.getElementById('quizPlay').classList.add('hidden');
        document.getElementById('quizResults').classList.remove('hidden');

        const resultTitle = document.getElementById('resultTitle') || document.querySelector('.result-stats h2');
        if (resultTitle) resultTitle.innerText = 'Quiz Completed!';

        // Score Card
        document.getElementById('resultScore').innerText = `${data.score}/${data.totalQuestions}`;

        // Cric Points Change
        const pointsDiffEl = document.getElementById('pointsDiff');
        if (data.pointsEarned >= 0) {
            pointsDiffEl.className = 'points-positive';
            pointsDiffEl.innerText = `+${data.pointsEarned}`;
        } else {
            pointsDiffEl.className = 'points-negative';
            pointsDiffEl.innerText = `${data.pointsEarned}`;
        }

        document.getElementById('resultCumulativePoints').innerText = data.cumulativePoints;

        // Dynamically update navbar statistics
        if (currentUser) {
            currentUser.cricPoints = data.cumulativePoints;
        }

        // Refresh profile data to sync attempt log and ranks in the sidebar
        refreshProfileData();

        // Detailed Review Items List
        const reviewContainer = document.getElementById('resultsReviewContainer');
        reviewContainer.innerHTML = '';

        data.results.forEach((res, index) => {
            const card = document.createElement('div');
            card.className = 'review-card';

            const isCorrect = res.isCorrect;
            const badgeClass = isCorrect ? 'correct-badge' : 'wrong-badge';
            const badgeText = isCorrect ? 'Correct' : 'Incorrect';

            let optionsHtml = '';
            res.options.forEach((opt, optIdx) => {
                let optionClass = 'review-option';
                if (optIdx === res.selectedOptionIndex) {
                    optionClass += ' user-selected';
                }
                if (optIdx === res.correctOptionIndex) {
                    optionClass += ' correct-option';
                }
                optionsHtml += `<div class="${optionClass}">${escapeHTML(opt)}</div>`;
            });

            card.innerHTML = `
                <div class="review-card-header">
                    <h4>Q${index + 1}: ${escapeHTML(res.questionText)}</h4>
                    <span class="result-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="review-options-list">
                    ${optionsHtml}
                </div>
                <div class="explanation-box">
                    💡 <strong>Explanation:</strong> ${escapeHTML(res.explanation)}
                </div>
            `;

            reviewContainer.appendChild(card);
        });

    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        setLoadingState(submitBtn, false);
        prevBtn.disabled = false;
    }
}

async function showQuizAttemptDetails(attemptId) {
    // 1. Close profile drawer
    closeProfileDrawer();

    // 2. Switch tab to quiz
    switchTab('quiz');

    // 3. Show Results panel, hiding others
    const quizIntro = document.getElementById('quizIntro');
    const quizLoading = document.getElementById('quizLoading');
    const quizPlay = document.getElementById('quizPlay');
    const quizResults = document.getElementById('quizResults');

    quizIntro.classList.add('hidden');
    quizPlay.classList.add('hidden');
    quizResults.classList.remove('hidden');
    quizLoading.classList.add('hidden');

    // Populate results container with spinner first
    const reviewContainer = document.getElementById('resultsReviewContainer');
    reviewContainer.innerHTML = '<div style="display:flex; justify-content:center; padding: 40px 0;"><div class="loading-spinner-large"></div></div>';

    try {
        const response = await fetch(`${API_BASE_URL}/quiz/attempt/${attemptId}`, {
            method: 'GET',
            headers: getHeaders()
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load details.');

        // Populate summary details
        const resultTitle = document.getElementById('resultTitle') || document.querySelector('.result-stats h2');
        if (resultTitle) resultTitle.innerText = 'Quiz Review';

        document.getElementById('resultScore').innerText = `${data.score}/${data.totalQuestions}`;

        const pointsDiffEl = document.getElementById('pointsDiff');
        if (data.pointsEarned >= 0) {
            pointsDiffEl.className = 'points-positive';
            pointsDiffEl.innerText = `+${data.pointsEarned}`;
        } else {
            pointsDiffEl.className = 'points-negative';
            pointsDiffEl.innerText = `${data.pointsEarned}`;
        }

        document.getElementById('resultCumulativePoints').innerText = currentUser ? currentUser.cricPoints : 0;

        // Render reviews
        reviewContainer.innerHTML = '';
        data.results.forEach((res, index) => {
            const card = document.createElement('div');
            card.className = 'review-card';

            const isCorrect = res.isCorrect;
            const badgeClass = isCorrect ? 'correct-badge' : 'wrong-badge';
            const badgeText = isCorrect ? 'Correct' : 'Incorrect';

            let optionsHtml = '';
            res.options.forEach((opt, optIdx) => {
                let optionClass = 'review-option';
                if (optIdx === res.selectedOptionIndex) {
                    optionClass += ' user-selected';
                }
                if (optIdx === res.correctOptionIndex) {
                    optionClass += ' correct-option';
                }
                optionsHtml += `<div class="${optionClass}">${escapeHTML(opt)}</div>`;
            });

            card.innerHTML = `
                <div class="review-card-header">
                    <h4>Q${index + 1}: ${escapeHTML(res.questionText)}</h4>
                    <span class="result-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="review-options-list">
                    ${optionsHtml}
                </div>
                <div class="explanation-box">
                    💡 <strong>Explanation:</strong> ${escapeHTML(res.explanation)}
                </div>
            `;

            reviewContainer.appendChild(card);
        });

    } catch (err) {
        reviewContainer.innerHTML = `<div style="color:#f87171; text-align:center; padding: 20px 0;">Error: ${err.message}</div>`;
    }
}

/* =========================================
   Left Side Profile Drawer Logic (SaaS Drawer)
   ========================================= */
function initProfileDrawer() {
    const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
    const sidebarTrack = document.getElementById('sidebarTrack');
    const detailBackBtn = document.getElementById('detailBackBtn');

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            if (target) {
                // Adjust class indicators
                menuItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                // Render specific detail panel content
                renderDrawerDetail(target);

                // Slide drawer track view left
                sidebarTrack.style.transform = 'translateX(-50%)';
            }
        });
    });

    detailBackBtn.addEventListener('click', () => {
        menuItems.forEach(i => i.classList.remove('active'));
        sidebarTrack.style.transform = 'translateX(0)';
    });
}

function getRankInfo(points) {
    if (points < 100) {
        return {
            rank: 'Bronze Rank',
            class: 'rank-bronze',
            nextPoints: 100,
            label: `${points}/100 to Silver`
        };
    } else if (points < 500) {
        return {
            rank: 'Silver Rank',
            class: 'rank-silver',
            nextPoints: 500,
            label: `${points}/500 to Gold`
        };
    } else {
        return {
            rank: 'Gold Rank',
            class: 'rank-gold',
            nextPoints: points,
            label: 'Maximum Rank Achieved'
        };
    }
}

function updateProfileDrawerUI() {
    if (!currentUser) return;

    // Fill profile tags
    document.getElementById('sidebarUserName').innerText = currentUser.name;
    document.getElementById('sidebarUserPhone').innerText = currentUser.phoneNumber;

    const dateStr = currentUser.createdAt
        ? new Date(currentUser.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
        : '-';
    document.getElementById('sidebarUserJoined').innerText = dateStr;

    // Fill user initials avatar in sidebar
    const initialsEl = document.getElementById('sidebarUserInitials');
    if (initialsEl) {
        initialsEl.innerText = getUserInitials(currentUser.name);
    }

    // Cric Points Card rendering
    const points = currentUser.cricPoints || 0;
    const rankInfo = getRankInfo(points);

    const rankEl = document.getElementById('pointsCardRank');
    if (rankEl) {
        rankEl.innerText = rankInfo.rank;
        rankEl.className = `rank-badge ${rankInfo.class}`;
    }

    document.getElementById('pointsCardValue').innerText = `${points} pts`;
    document.getElementById('pointsCardProgressLabel').innerText = rankInfo.label;

    const progressFill = document.getElementById('pointsCardProgress');
    if (points >= 500) {
        progressFill.style.width = '100%';
    } else {
        const percent = (points / rankInfo.nextPoints) * 100;
        progressFill.style.width = `${percent}%`;
    }
}

async function renderDrawerDetail(targetKey) {
    const titleEl = document.getElementById('detailPanelTitle');
    const contentEl = document.getElementById('detailPanelContent');
    contentEl.innerHTML = '';

    if (targetKey === 'points') {
        titleEl.innerText = 'Cric Points Breakdown';

        // Sum total score points breakdown
        const totalPoints = currentUser ? currentUser.cricPoints : 0;
        let quizEarnings = 0;
        if (Array.isArray(userAttempts)) {
            userAttempts.forEach(a => {
                quizEarnings += (a.pointsEarned || 0);
            });
        }
        quizEarnings = Math.max(0, quizEarnings);
        const otherPoints = Math.max(0, totalPoints - quizEarnings);

        contentEl.innerHTML = `
            <div class="points-breakdown-list">
                <div class="points-breakdown-row" style="border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 14px; margin-bottom: 8px;">
                    <span class="label" style="font-weight: 500;">Total Score Points</span>
                    <span class="value" style="color:#ffd700; font-size:1.25rem; font-weight:700;">${totalPoints} pts</span>
                </div>
                <div class="points-breakdown-row">
                    <span class="label">📝 Quiz Earned Points</span>
                    <span class="value">${quizEarnings} pts</span>
                </div>
                <div class="points-breakdown-row">
                    <span class="label">🤖 AI Chat activity & System bonus</span>
                    <span class="value">${otherPoints} pts</span>
                </div>
            </div>
        `;
    }
    else if (targetKey === 'history') {
        titleEl.innerText = 'Quiz History';

        if (!userAttempts || userAttempts.length === 0) {
            contentEl.innerHTML = `
                <div class="empty-state-container">
                    <svg class="empty-illustration" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    <p class="empty-message">No quiz attempts yet. Start a quiz to earn Cric Points.</p>
                    <button id="drawerStartQuizBtn" class="btn btn-primary" style="margin-top:10px;">Start Quiz</button>
                </div>
            `;

            // Bind action to empty-state CTA button
            document.getElementById('drawerStartQuizBtn').addEventListener('click', () => {
                // Close sidebar drawer
                closeProfileDrawer();
                // Switch to Quiz Tab
                switchTab('quiz');
                // Trigger quiz generation
                startQuiz();
            });
        } else {
            let historyHtml = '<div class="drawer-history-list">';
            userAttempts.forEach(attempt => {
                const dateStr = attempt.completedAt
                    ? new Date(attempt.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '-';
                const score = attempt.score || 0;
                const points = attempt.pointsEarned || 0;

                const badgeClass = score >= 5 ? 'status-passed' : 'status-failed';
                const badgeText = score >= 5 ? 'Passed' : 'Failed';
                const pointsClass = points >= 0 ? 'points-positive' : 'points-negative';
                const pointsSign = points >= 0 ? `+${points}` : points;

                historyHtml += `
                    <div class="drawer-history-card" data-attempt-id="${attempt._id}">
                        <div class="history-card-row">
                            <span class="history-card-title">🏏 Personalized Quiz</span>
                            <span class="status-badge ${badgeClass}">${badgeText}</span>
                        </div>
                        <div class="history-card-row" style="margin-top:4px;">
                            <span class="history-card-date">${dateStr}</span>
                            <span class="history-card-score">Score: ${score}/10</span>
                        </div>
                        <div class="history-card-row" style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.03); padding-top:6px;">
                            <span style="font-size:0.8rem; color:var(--text-secondary);">Points earned</span>
                            <span class="history-card-points ${pointsClass}">${pointsSign} pts</span>
                        </div>
                    </div>
                `;
            });
            historyHtml += '</div>';
            contentEl.innerHTML = historyHtml;

            // Bind click handlers to attempts cards
            document.querySelectorAll('.drawer-history-card').forEach(card => {
                card.addEventListener('click', () => {
                    const attemptId = card.getAttribute('data-attempt-id');
                    showQuizAttemptDetails(attemptId);
                });
            });
        }
    }
    else if (targetKey === 'chat-history') {
        titleEl.innerText = 'Chat History';

        // Show loading spinner
        contentEl.innerHTML = '<div style="display:flex; justify-content:center; padding: 40px 0;"><div class="loading-spinner-large"></div></div>';

        try {
            const response = await fetch(`${API_BASE_URL}/ask/history`, {
                method: 'GET',
                headers: getHeaders()
            });
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Failed to fetch history.');

            if (!data || data.length === 0) {
                contentEl.innerHTML = `
                    <div class="empty-state-container">
                        <svg class="empty-illustration" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                        <p class="empty-message">No messages yet. Ask anything in the chat feed to start a conversation.</p>
                    </div>
                `;
            } else {
                let historyHtml = '<div class="drawer-history-list">';
                data.forEach((session, index) => {
                    const dateStr = session.timestamp
                        ? new Date(session.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '-';
                    historyHtml += `
                        <div class="drawer-history-card chat-history-item" data-session-index="${index}">
                            <div class="history-card-row">
                                <span class="history-card-title">💬 Session #${data.length - index}</span>
                                <span class="history-card-date">${dateStr}</span>
                            </div>
                            <div class="history-card-row" style="margin-top: 6px;">
                                <span class="history-card-question-text" style="font-size:0.9rem; color:#e2e8f0; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                                    ${escapeHTML(session.firstQuestion)}
                                </span>
                            </div>
                        </div>
                    `;
                });
                historyHtml += '</div>';
                contentEl.innerHTML = historyHtml;

                // Bind click handlers to chat history cards
                document.querySelectorAll('.chat-history-item').forEach(card => {
                    card.addEventListener('click', () => {
                        const sIdx = parseInt(card.getAttribute('data-session-index'));
                        const session = data[sIdx];
                        closeProfileDrawer();
                        switchTab('chat');
                        displaySelectedChatSession(session);
                    });
                });
            }
        } catch (err) {
            contentEl.innerHTML = `<div style="color:#f87171; text-align:center; padding:20px 0;">Error: ${err.message}</div>`;
        }
    }
    else if (targetKey === 'stats') {
        titleEl.innerText = 'Performance Stats';

        const totalQuizzes = userAttempts ? userAttempts.length : 0;
        let totalCorrect = 0;
        let bestScore = 0;
        if (userAttempts) {
            userAttempts.forEach(a => {
                totalCorrect += (a.score || 0);
                if ((a.score || 0) > bestScore) {
                    bestScore = a.score || 0;
                }
            });
        }
        const totalQuestions = totalQuizzes * 10;
        const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

        contentEl.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card-small">
                    <span class="label">Quizzes Taken</span>
                    <span class="value">${totalQuizzes}</span>
                </div>
                <div class="stat-card-small">
                    <span class="label">Best Score</span>
                    <span class="value">${bestScore}/10</span>
                </div>
                <div class="stat-card-small">
                    <span class="label">Total Correct</span>
                    <span class="value">${totalCorrect}</span>
                </div>
                <div class="stat-card-small">
                    <span class="label">AI Queries</span>
                    <span class="value">${Math.floor(chatHistory.length / 2)}</span>
                </div>
            </div>
            <div class="accuracy-radial-container">
                <span class="accuracy-radial-label">Overall Accuracy</span>
                <span class="accuracy-radial-value">${accuracy}%</span>
                <span class="form-help">Accuracy rate over all completed quiz questions.</span>
            </div>
        `;
    }
    else if (targetKey === 'settings') {
        titleEl.innerText = 'Settings';

        const nameValue = currentUser ? currentUser.name : '';

        contentEl.innerHTML = `
            <form id="settingsForm" class="settings-form">
                <div class="form-group">
                    <label for="settingsNameInput">Full Name</label>
                    <input type="text" id="settingsNameInput" value="${escapeHTML(nameValue)}" required autocomplete="off">
                    <small class="form-help">Update your public name displayed on the profile chip and dashboard.</small>
                </div>
                <button type="submit" class="btn btn-primary settings-btn" id="settingsSaveBtn">
                    <span class="btn-text">Save Changes</span>
                    <div class="spinner hidden"></div>
                </button>
            </form>
            <div id="settingsStatus" class="status-message" style="margin-top:16px;"></div>
        `;

        // Handle settings saving locally
        document.getElementById('settingsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const newName = document.getElementById('settingsNameInput').value.trim();
            if (!newName) return;

            const saveBtn = document.getElementById('settingsSaveBtn');
            const statusEl = document.getElementById('settingsStatus');
            setLoadingState(saveBtn, true);
            statusEl.className = 'status-message';
            statusEl.innerText = '';

            setTimeout(() => {
                if (currentUser) {
                    currentUser.name = newName;

                    // Sync name globally across views
                    const initialsEl = document.getElementById('navUserInitials');
                    if (initialsEl) initialsEl.innerText = getUserInitials(newName);

                    const sidebarInitialsEl = document.getElementById('sidebarUserInitials');
                    if (sidebarInitialsEl) sidebarInitialsEl.innerText = getUserInitials(newName);

                    document.getElementById('sidebarUserName').innerText = newName;

                    statusEl.className = 'status-message status-success';
                    statusEl.innerText = 'Profile settings updated successfully!';
                }
                setLoadingState(saveBtn, false);
            }, 800);
        });
    }
}

/* =========================================
   Modal & Documents Integration (Preserved)
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

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (footerOpenBtn) footerOpenBtn.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (refreshBtn) refreshBtn.addEventListener('click', fetchDocuments);

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }
}

async function fetchDocuments() {
    const tableBody = document.getElementById('docsTableBody');
    const loading = document.getElementById('docsLoading');

    tableBody.innerHTML = '';
    loading.classList.remove('hidden');

    try {
        const response = await fetch(`${API_BASE_URL}/documents`, {
            method: 'GET',
            headers: getHeaders(null)
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Failed to fetch documents.');

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="2" style="text-align: center; color: var(--text-secondary);">No documents indexed yet.</td></tr>`;
        } else {
            data.forEach(doc => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHTML(doc.filename)}</td>
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
   Upload Integration (Preserved & Adjusted)
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
            // Set multipart request: do NOT set content-type header
            const response = await fetch(`${API_BASE_URL}/upload`, {
                method: 'POST',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
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
