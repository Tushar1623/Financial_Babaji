// API Configuration
const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:8000' : 'https://financial-babaji-api.herokuapp.com';

const API_CONFIG = {
    cryptocompare: {
        url: 'https://min-api.cryptocompare.com/data/v2/news/?lang=EN',
        apiKey: 'YOUR_CRYPTOCOMPARE_API_KEY'
    },
    coindesk: {
        url: 'https://api.rss2json.com/v1/api.json?rss_url=https://www.coindesk.com/arc/outboundfeeds/rss/',
        apiKey: 'YOUR_RSS2JSON_API_KEY'
    },
    cryptopanic: {
        url: 'https://cryptopanic.com/api/v1/posts/?auth_token=YOUR_CRYPTOPANIC_API_KEY&public=true'
    },
    coingecko: {
        url: 'https://api.coingecko.com/api/v3/simple/price',
        params: {
            ids: 'bitcoin,ethereum,binancecoin,cardano,solana,ripple,dogecoin,polkadot',
            vs_currencies: 'usd',
            include_24hr_change: 'true'
        }
    }
};

// Constants
const ARTICLES_PER_PAGE = 12;
const CRYPTO_SYMBOLS = {
    bitcoin: 'BTC',
    ethereum: 'ETH',
    binancecoin: 'BNB',
    cardano: 'ADA',
    solana: 'SOL',
    ripple: 'XRP',
    dogecoin: 'DOGE',
    polkadot: 'DOT'
};

// DOM Elements
const newsContainer = document.getElementById('news-container');
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const sourceFilter = document.getElementById('sourceFilter');
const sortFilter = document.getElementById('sortFilter');
const loadingIndicator = document.getElementById('loadingIndicator');
const paginationContainer = document.getElementById('pagination');
const priceTicker = document.getElementById('priceTicker');
const signalsContainer = document.getElementById('signalsContainer');

// State
let allArticles = [];
let currentPage = 1;
let filteredArticles = [];

// For trade signals (simple RSI/trend calculation)
const PRICE_HISTORY_LENGTH = 14;
let priceHistory = {
    BTC: [],
    ETH: []
};

// Theme Toggle
const themeToggle = document.getElementById('themeToggle');
const themeIcon = themeToggle.querySelector('i');

// Check for saved theme preference or use system preference
const savedTheme = localStorage.getItem('theme');
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
} else {
    const initialTheme = systemPrefersDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', initialTheme);
    updateThemeIcon(initialTheme);
}

function updateThemeIcon(theme) {
    if (theme === 'dark') {
        themeIcon.classList.remove('fa-sun');
        themeIcon.classList.add('fa-moon');
    } else {
        themeIcon.classList.remove('fa-moon');
        themeIcon.classList.add('fa-sun');
    }
}

themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
});

// Function to format price
function formatPrice(price) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(price);
}

// Function to format percentage
function formatPercentage(change) {
    return `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
}

// Function to create ticker item
function createTickerItem(symbol, price, change) {
    const tickerItem = document.createElement('div');
    tickerItem.className = 'ticker-item';

    const isPositive = change >= 0;
    const changeIcon = isPositive ? '↑' : '↓';

    // Dummy AI trade signal logic
    let signal = 'Hold', signalClass = 'signal-hold';
    if (change > 1.5) {
        signal = 'Buy';
        signalClass = 'signal-buy';
    } else if (change < -1.5) {
        signal = 'Sell';
        signalClass = 'signal-sell';
    }

    tickerItem.innerHTML = `
        <span class="ticker-symbol">${symbol}</span>
        <span class="ticker-price">${formatPrice(price)}</span>
        <span class="ticker-change ${isPositive ? 'positive' : 'negative'}">
            ${changeIcon} ${formatPercentage(change)}
        </span>
        <span class="trade-signal-badge ${signalClass}">${signal}</span>
    `;

    return tickerItem;
}

// Function to fetch with retry
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.status === 429) { // Rate limit exceeded
                const retryAfter = response.headers.get('Retry-After') || 60;
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                continue;
            }
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
    }
}

// Function to fetch and display cryptocurrency prices
async function fetchCryptoPrices() {
    try {
        const { url, params } = API_CONFIG.coingecko;
        const queryParams = new URLSearchParams(params).toString();
        
        // Use fetchWithRetry for better reliability
        const response = await fetchWithRetry(
            `${url}?${queryParams}`,
            {
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            },
            3 // max retries
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (!data || Object.keys(data).length === 0) {
            throw new Error('No price data received');
        }

        // Clear existing ticker items
        priceTicker.innerHTML = '';

        // Process each cryptocurrency
        Object.entries(data).forEach(([coin, details]) => {
            const symbol = CRYPTO_SYMBOLS[coin];
            const price = details.usd;
            const change = details.usd_24h_change;
            
            if (symbol && typeof price === 'number' && typeof change === 'number') {
                const tickerItem = createTickerItem(symbol, price, change);
                priceTicker.appendChild(tickerItem);

                // Update price history for signals
                if (priceHistory[symbol]) {
                    priceHistory[symbol].push(price);
                    if (priceHistory[symbol].length > PRICE_HISTORY_LENGTH) {
                        priceHistory[symbol].shift();
                    }
                }
            }
        });

        // Add a timestamp to track last successful update
        priceTicker.setAttribute('data-last-update', new Date().toISOString());

    } catch (error) {
        console.error('Error fetching crypto prices:', error);
        
        // Show error message if the ticker is empty
        if (!priceTicker.children.length) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'ticker-error';
            errorDiv.textContent = '⚠️ Price data temporarily unavailable';
            priceTicker.appendChild(errorDiv);
        }

        // Try again in 10 seconds if it's a temporary error
        setTimeout(fetchCryptoPrices, 10000);
    }
}

// Function to show loading state
function showLoading() {
    loadingIndicator.style.display = 'block';
    newsContainer.style.opacity = '0.5';
}

// Function to hide loading state
function hideLoading() {
    loadingIndicator.style.display = 'none';
    newsContainer.style.opacity = '1';
}

// Function to show error message
function showError(message) {
    newsContainer.innerHTML = `
        <div class="error-message">
            <p>Error: ${message}</p>
            <p>Please try again later.</p>
        </div>
    `;
    hideLoading();
}

// Function to truncate text
function truncateText(text, maxLength = 120) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Function to create a news article element
function createNewsArticle(article) {
    const articleElement = document.createElement('article');
    articleElement.className = 'news-article';
    
    const imageUrl = article.imageurl || article.thumbnail || 'https://via.placeholder.com/400x200?text=Crypto+News';
    const title = article.title || article.headline || 'Untitled';
    const description = truncateText(article.body || article.description || 'No description available');
    const url = article.url || article.link || '#';
    const source = article.source || 'Unknown';
    const publishedAt = article.publishedAt || article.published_on || new Date().toISOString();
    
    articleElement.innerHTML = `
        <img src="${imageUrl}" alt="${title}" class="article-image">
        <div class="article-content">
            <h2 class="article-title">${title}</h2>
            <p class="article-description">${description}</p>
            <div class="article-meta">
                <span class="article-source"><i class="fas fa-newspaper"></i> ${source}</span>
                <span class="article-date"><i class="far fa-clock"></i> ${new Date(publishedAt).toLocaleDateString()}</span>
            </div>
            <a href="${url}" target="_blank" rel="noopener noreferrer" class="read-more">
                Read More
            </a>
        </div>
    `;
    
    return articleElement;
}

// Function to filter articles
function filterArticles() {
    const searchTerm = searchInput.value.toLowerCase();
    const selectedSource = sourceFilter.value;
    const sortOrder = sortFilter.value;

    filteredArticles = allArticles.filter(article => {
        const matchesSearch = article.title.toLowerCase().includes(searchTerm) ||
                            article.description.toLowerCase().includes(searchTerm);
        const matchesSource = selectedSource === 'all' || article.source === selectedSource;
        return matchesSearch && matchesSource;
    });

    // Sort articles
    filteredArticles.sort((a, b) => {
        const dateA = new Date(a.publishedAt || a.published_on);
        const dateB = new Date(b.publishedAt || b.published_on);
        return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

    currentPage = 1;
    displayArticles();
}

// Function to display articles with pagination
function displayArticles() {
    const startIndex = (currentPage - 1) * ARTICLES_PER_PAGE;
    const endIndex = startIndex + ARTICLES_PER_PAGE;
    const articlesToShow = filteredArticles.slice(startIndex, endIndex);

    newsContainer.innerHTML = '';
    
    if (articlesToShow.length === 0) {
        newsContainer.innerHTML = '<div class="error-message">No articles found matching your criteria.</div>';
        paginationContainer.innerHTML = '';
        return;
    }

    articlesToShow.forEach(article => {
        const articleElement = createNewsArticle(article);
        newsContainer.appendChild(articleElement);
    });

    updatePagination();
}

// Function to update pagination controls
function updatePagination() {
    const totalPages = Math.ceil(filteredArticles.length / ARTICLES_PER_PAGE);
    
    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    let paginationHTML = '';
    
    // Previous button
    paginationHTML += `
        <button class="pagination-btn ${currentPage === 1 ? 'disabled' : ''}" 
                onclick="changePage(${currentPage - 1})" 
                ${currentPage === 1 ? 'disabled' : ''}>
            Previous
        </button>
    `;

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            paginationHTML += `
                <button class="pagination-btn ${i === currentPage ? 'active' : ''}" 
                        onclick="changePage(${i})">
                    ${i}
                </button>
            `;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            paginationHTML += '<span class="pagination-ellipsis">...</span>';
        }
    }

    // Next button
    paginationHTML += `
        <button class="pagination-btn ${currentPage === totalPages ? 'disabled' : ''}" 
                onclick="changePage(${currentPage + 1})" 
                ${currentPage === totalPages ? 'disabled' : ''}>
            Next
        </button>
    `;

    paginationContainer.innerHTML = paginationHTML;
}

// Function to change page
function changePage(page) {
    if (page < 1 || page > Math.ceil(filteredArticles.length / ARTICLES_PER_PAGE)) {
        return;
    }
    currentPage = page;
    displayArticles();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Function to fetch news from CryptoCompare
async function fetchCryptoCompareNews() {
    try {
        const response = await fetch(`${API_CONFIG.cryptocompare.url}&api_key=${API_CONFIG.cryptocompare.apiKey}`);
        if (!response.ok) throw new Error('CryptoCompare API error');
        const data = await response.json();
        return data.Data.map(article => ({
            ...article,
            source: 'cryptocompare',
            publishedAt: article.published_on
        }));
    } catch (error) {
        console.error('Error fetching CryptoCompare news:', error);
        return [];
    }
}

// Function to fetch news from CoinDesk
async function fetchCoinDeskNews() {
    try {
        const response = await fetch(`${API_CONFIG.coindesk.url}&api_key=${API_CONFIG.coindesk.apiKey}`);
        if (!response.ok) throw new Error('CoinDesk API error');
        const data = await response.json();
        return data.items.map(article => ({
            ...article,
            source: 'coindesk',
            publishedAt: article.pubDate
        }));
    } catch (error) {
        console.error('Error fetching CoinDesk news:', error);
        return [];
    }
}

// Function to fetch news from CryptoPanic
async function fetchCryptoPanicNews() {
    try {
        const response = await fetch(API_CONFIG.cryptopanic.url);
        if (!response.ok) throw new Error('CryptoPanic API error');
        const data = await response.json();
        return data.results.map(article => ({
            ...article,
            source: 'cryptopanic',
            publishedAt: article.published_at
        }));
    } catch (error) {
        console.error('Error fetching CryptoPanic news:', error);
        return [];
    }
}

// Function to fetch all news
async function fetchAllNews() {
    showLoading();
    
    try {
        const [cryptoCompareNews, coinDeskNews, cryptoPanicNews] = await Promise.all([
            fetchCryptoCompareNews(),
            fetchCoinDeskNews(),
            fetchCryptoPanicNews()
        ]);

        allArticles = [...cryptoCompareNews, ...coinDeskNews, ...cryptoPanicNews];
        filteredArticles = [...allArticles];
        displayArticles();
    } catch (error) {
        console.error('Error fetching news:', error);
        showError('Failed to fetch news articles');
    } finally {
        hideLoading();
    }
}

// Event Listeners
searchButton.addEventListener('click', filterArticles);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        filterArticles();
    }
});

sourceFilter.addEventListener('change', filterArticles);
sortFilter.addEventListener('change', filterArticles);

// Fetch news when the page loads
document.addEventListener('DOMContentLoaded', fetchAllNews);

// Fetch crypto prices when the page loads and every minute
document.addEventListener('DOMContentLoaded', () => {
    fetchCryptoPrices();
    setInterval(fetchCryptoPrices, 60000); // Update every minute
    renderTradingViewWidgets();
});

// Render TradingView widgets for BTC and ETH
function renderTradingViewWidgets() {
    if (typeof TradingView === 'undefined') {
        setTimeout(renderTradingViewWidgets, 500);
        return;
    }
    // BTC
    new TradingView.widget({
        "width": "100%",
        "height": 420,
        "symbol": "BINANCE:BTCUSDT",
        "interval": "30",
        "timezone": "Etc/UTC",
        "theme": document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
        "style": "1",
        "locale": "en",
        "toolbar_bg": "#f1f3f6",
        "container_id": "tv-btc"
    });
    // ETH
    new TradingView.widget({
        "width": "100%",
        "height": 420,
        "symbol": "BINANCE:ETHUSDT",
        "interval": "30",
        "timezone": "Etc/UTC",
        "theme": document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
        "style": "1",
        "locale": "en",
        "toolbar_bg": "#f1f3f6",
        "container_id": "tv-eth"
    });
}


// Refresh news every 5 minutes
setInterval(fetchAllNews, 5 * 60 * 1000); 

// Authentication functions
async function login(username, password) {
    try {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch(`${API_URL}/token`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Login failed');
        }

        const data = await response.json();
        localStorage.setItem('token', data.access_token);
        return true;
    } catch (error) {
        console.error('Login error:', error);
        return false;
    }
}

async function signup(username, password, email = '', fullName = '') {
    try {
        const response = await fetch(`${API_URL}/signup?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&email=${encodeURIComponent(email)}&full_name=${encodeURIComponent(fullName)}`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error('Signup failed');
        }

        return true;
    } catch (error) {
        console.error('Signup error:', error);
        return false;
    }
}

async function getUserProfile() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('No token found');
        }

        const response = await fetch(`${API_URL}/users/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to get user profile');
        }

        return await response.json();
    } catch (error) {
        console.error('Get profile error:', error);
        return null;
    }
}

function logout() {
    localStorage.removeItem('token');
    updateAuthUI();
}

function updateAuthUI() {
    const token = localStorage.getItem('token');
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const headerRight = document.querySelector('.header-right');

    if (token) {
        // User is logged in
        loginBtn.style.display = 'none';
        signupBtn.style.display = 'none';
        
        // Add logout button if it doesn't exist
        if (!document.getElementById('logoutBtn')) {
            const logoutBtn = document.createElement('button');
            logoutBtn.id = 'logoutBtn';
            logoutBtn.className = 'auth-btn';
            logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Logout';
            logoutBtn.onclick = logout;
            headerRight.insertBefore(logoutBtn, document.getElementById('themeToggle'));
        }
    } else {
        // User is logged out
        loginBtn.style.display = 'flex';
        signupBtn.style.display = 'flex';
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.remove();
        }
    }
}

// Add event listeners for login and signup buttons
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');

    loginBtn.addEventListener('click', async () => {
        const username = prompt('Enter username:');
        const password = prompt('Enter password:');
        
        if (username && password) {
            const success = await login(username, password);
            if (success) {
                alert('Login successful!');
                updateAuthUI();
            } else {
                alert('Login failed. Please try again.');
            }
        }
    });

    signupBtn.addEventListener('click', async () => {
        const username = prompt('Choose a username:');
        const password = prompt('Choose a password:');
        const email = prompt('Enter your email (optional):');
        const fullName = prompt('Enter your full name (optional):');

        if (username && password) {
            const success = await signup(username, password, email, fullName);
            if (success) {
                alert('Signup successful! Please log in.');
            } else {
                alert('Signup failed. Please try again.');
            }
        }
    });

    // Initialize auth UI
    updateAuthUI();
});