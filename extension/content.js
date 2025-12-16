// HemingwAI Extension - Content Script
// Detecta noticias y muestra su valoración de calidad.

// Configuración
const DEBUG_MODE = true; // Set to true to enable visual debug outlines
const API_BASE = "https://hemingwai-backend.onrender.com";
const API_ENDPOINT_BATCH = `${API_BASE}/api/check-urls`;
const ANALYSIS_BASE_URL = "https://hemingwai-frontend.onrender.com";
const MAX_URLS_PER_PAGE = 100; 

// Logos
const BLUE_LOGO_URL = chrome.runtime.getURL("logo_extension_blue.png");
const WHITE_LOGO_URL = chrome.runtime.getURL("logo_ectension_blanco.png");

// ========================================================
// HELPERS
// ========================================================

function normalizeUrl(urlStr) {
    try {
        const u = new URL(urlStr);
        return u.origin + u.pathname;
    } catch (e) {
        return urlStr;
    }
}

function normalizeUrlForDedup(urlStr) {
    try {
        const u = new URL(urlStr);
        let path = u.pathname;
        if (path.length > 1 && path.endsWith('/')) {
            path = path.slice(0, -1);
        }
        return u.origin + path;
    } catch (e) {
        return urlStr;
    }
}

function getOgType() {
    const meta = document.querySelector('meta[property="og:type"]');
    return meta ? meta.content : null;
}

function hasPublishDateMeta() {
    const selectors = [
        'meta[property="article:published_time"]',
        'meta[itemprop="datePublished"]',
        'meta[name="date"]',
        'meta[name="DC.date.issued"]',
        'meta[name="pubdate"]'
    ];
    return document.querySelector(selectors.join(',')) !== null;
}

function getNewsArticleLdJsonCount() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    let count = 0;
    for (const script of scripts) {
        if (script.textContent.includes('"NewsArticle"') || 
            script.textContent.includes('"ReportageNewsArticle"') ||
            script.textContent.includes('"Article"')) {
            const matches = (script.textContent.match(/"(News)?Article"/g) || []).length;
            count += matches;
        }
    }
    return count;
}

function getArticleTagCount() {
    return document.getElementsByTagName('article').length;
}
// Helper para usar chrome.runtime.sendMessage con async/await
function sendMessageAsync(message) {
    return new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn("[HemingwAI] runtime.lastError:", chrome.runtime.lastError);
                    resolve(undefined);
                } else {
                    resolve(response);
                }
            });
        } catch (e) {
            console.error("[HemingwAI] Error en sendMessageAsync:", e);
            resolve(undefined);
        }
    });
}

// ========================================================
// COLOR & LOGO LOGIC
// ========================================================

function getColorForScore(score) {
    // If undefined/null -> Pending state
    if (score === undefined || score === null || String(score).trim() === '') {
        return { bgColor: '#001a33', useWhiteLogo: false }; // Dark Navy (Pending) - Blue Logo
    }

    const val = Number(score);
    if (isNaN(val)) return { bgColor: '#001a33', useWhiteLogo: false };

    // Semáforo:
    // < 50: Rojo (Mala) -> Logo Blanco, Texto Blanco
    // 50-69: Amarillo (Regular) -> Logo Azul (texto oscuro), Texto Negro
    // >= 70: Verde (Buena) -> Logo Blanco, Texto Blanco
    
    if (val < 50) {
        return { bgColor: '#dc3545', useWhiteLogo: true }; // Red
    }
    if (val < 70) {
        return { bgColor: '#ffc107', useWhiteLogo: false }; // Yellow
    }
    return { bgColor: '#28a745', useWhiteLogo: true }; // Green
}

// ========================================================
// POPOVER LOGIC (Attach to Badge ONLY)
// ========================================================

let currentPinnedBadge = null;
let activePopover = null;

function hidePopover(popoverEl) {
    if (!popoverEl) return;
    popoverEl.classList.remove('visible');
    setTimeout(() => {
        if (popoverEl.parentNode) popoverEl.parentNode.removeChild(popoverEl);
        if (activePopover === popoverEl) activePopover = null;
    }, 150);
}

function closeAllHemingwaiPopovers() {
    if (currentPinnedBadge) {
        currentPinnedBadge.__pinned = false;
        currentPinnedBadge = null;
    }
    const popovers = document.querySelectorAll('.hemingwai-popover');
    popovers.forEach(p => hidePopover(p));
    activePopover = null;
}

function showPopoverForBadge(badgeEl, popoverEl) { 
    // Close others
    const existing = document.querySelectorAll('.hemingwai-popover');
    existing.forEach(el => el.remove());

    // Append new popover
    document.body.appendChild(popoverEl);

    // Position
    const rect = badgeEl.getBoundingClientRect();
    const margin = 8;
    const windowWidth = window.innerWidth;

    const top = rect.bottom + margin;
    let left = rect.left;
    const popoverWidth = 320; 

    if (left + popoverWidth + 16 > windowWidth) {
        left = windowWidth - popoverWidth - 16;
    }
    if (left < 16) left = 16;

    popoverEl.style.top = `${top}px`;
    popoverEl.style.left = `${left}px`;
    
    // Show
    void popoverEl.offsetWidth;
    popoverEl.classList.add('visible');
    activePopover = popoverEl;
}

function createPopoverElement(data) {
    const isPending = (data.puntuacion === undefined || data.puntuacion === null || String(data.puntuacion).trim() === '');
    const id = data.id || '';
    const linkUrl = `${ANALYSIS_BASE_URL}${id}`;
    
    let contentHtml = '';

    // Color text for global score in popover
    const scoreVal = data.puntuacion;
    const { bgColor } = getColorForScore(scoreVal);

    if (isPending) {
        contentHtml = `
            <h4>Análisis HemingwAI</h4>
            <div class="hemingwai-section">
                <span class="hemingwai-label">ESTADO</span>
                <div class="hemingwai-text">
                    Noticia registrada en la base de datos de HemingwAI, pero aún no ha sido analizada automáticamente.
                </div>
            </div>
            <div class="hemingwai-section">
                <span class="hemingwai-label">¿Qué verás cuando esté lista?</span>
                <div class="hemingwai-text">
                    Cuando el análisis esté disponible, aquí aparecerá una puntuación global de 0 a 100, un resumen y el análisis del titular.
                </div>
            </div>
        `;
    } else {
        const resumen = data.resumen_valoracion || "Sin resumen disponible.";
        const resumenTitular = data.resumen_valoracion_titular || "Sin análisis específico.";
        
        contentHtml = `
            <h4>Análisis HemingwAI</h4>
            <div class="hemingwai-section">
                <span class="hemingwai-label">PUNTUACIÓN GLOBAL</span>
                <span class="hemingwai-score" style="color: ${bgColor}">${scoreVal}/100</span>
            </div>
            <div class="hemingwai-section">
                <span class="hemingwai-label">RESUMEN</span>
                <div class="hemingwai-text">${resumen}</div>
            </div>
            <div class="hemingwai-section">
                <span class="hemingwai-label">ANÁLISIS DEL TITULAR</span>
                <div class="hemingwai-text">${resumenTitular}</div>
            </div>
        `;
    }

    if (id) {
        contentHtml += `
            <div class="hemingwai-footer" style="display:flex; justify-content:space-between; gap:12px; align-items:center;">
                 <a href="${linkUrl}" target="_blank" class="hemingwai-link">Ver ficha completa &rarr;</a>
                 <a href="#" class="hemingwai-link hemingwai-chat-link">Abrir chat &rarr;</a>
            </div>
        `;
    }

    const popover = document.createElement('div');
    popover.className = 'hemingwai-popover';
    popover.innerHTML = contentHtml;
    
    // Attach listener for chat
    const chatLink = popover.querySelector('.hemingwai-chat-link');
    if (chatLink) {
        chatLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const targetUrl = data.url || window.location.href;
            const sidebar = ensureHemingwaiSidebar();
            
            // Open sidebar with URL
            sidebar.openWithUrl(targetUrl);
            
            // Close popover immediately
            closeAllHemingwaiPopovers();
        });
    }

    popover.addEventListener('mouseenter', () => {
         // Keep open logic
    });

    return popover;
}

function attachPopoverHandlersToBadge(badgeEl, data) {
    let pinned = false;
    let hideTimer = null;

    console.log('[HemingwAI] Attaching popover handlers to badge', {
        context: data && data.url ? 'list_or_article' : 'unknown',
        url: data && data.url
    });
    
    function openPopover() {
        const popoverEl = createPopoverElement(data);
        
        popoverEl.addEventListener('mouseenter', () => {
            if (hideTimer) clearTimeout(hideTimer);
        });
        popoverEl.addEventListener('mouseleave', () => {
            if (!pinned) closePopover();
        });

        showPopoverForBadge(badgeEl, popoverEl);
    }

    function closePopover() {
        if (activePopover) {
            hideTimer = setTimeout(() => {
                hidePopover(activePopover);
            }, 150); // Small delay
        }
    }

    badgeEl.addEventListener('mouseenter', () => {
        if (hideTimer) clearTimeout(hideTimer);
        if (!pinned) openPopover();
    });

    badgeEl.addEventListener('mouseleave', () => {
        if (!pinned) closePopover();
    });

    badgeEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (currentPinnedBadge && currentPinnedBadge !== badgeEl) {
            currentPinnedBadge.__pinned = false;
            const all = document.querySelectorAll('.hemingwai-popover');
            all.forEach(p => p.remove()); 
            activePopover = null;
        }

        pinned = !badgeEl.__pinned;
        badgeEl.__pinned = pinned;

        if (pinned) {
            currentPinnedBadge = badgeEl;
            if (hideTimer) clearTimeout(hideTimer);
            openPopover(); 
        } else {
            currentPinnedBadge = null;
            closePopover();
        }
    });
}

// Global listeners
document.addEventListener('click', (event) => {
    if (!currentPinnedBadge) return;

    const badge = currentPinnedBadge;
    const isBadge = badge.contains(event.target);
    const isPopover = activePopover && activePopover.contains(event.target);

    if (!isBadge && !isPopover) {
        badge.__pinned = false;
        currentPinnedBadge = null;
        if (activePopover) hidePopover(activePopover);
    }
});

window.addEventListener('scroll', () => {
    if (currentPinnedBadge) {
        currentPinnedBadge.__pinned = false;
        currentPinnedBadge = null;
    }
    const popovers = document.querySelectorAll('.hemingwai-popover');
    popovers.forEach(p => hidePopover(p));
    activePopover = null;
}, { passive: true });


// ========================================================
// BADGE CREATION & UPDATE
// ========================================================

function updateHemingwaiBadge(badge, data) {
    const score = data.puntuacion;
    const img = badge.querySelector('.hemingwai-badge-logo');
    const scoreSpan = badge.querySelector('.hemingwai-badge-score');

    const hasScore = (score !== undefined && score !== null && String(score).trim() !== '');

    if (hasScore) {
        scoreSpan.textContent = String(score);
        scoreSpan.style.display = 'inline-block';
        badge.title = `Puntuación HemingwAI: ${score}/100`;
        badge.classList.remove('hemingwai-badge-pending');
    } else {
        scoreSpan.textContent = '';
        scoreSpan.style.display = 'none';
        badge.title = "HemingwAI: Pendiente de análisis";
        badge.classList.add('hemingwai-badge-pending');
    }

    const { bgColor, useWhiteLogo } = getColorForScore(score);
    badge.style.backgroundColor = bgColor;

    if (bgColor === '#ffc107') {
        badge.style.color = '#001a33'; 
    } else {
        badge.style.color = '#ffffff'; 
    }

    img.src = useWhiteLogo ? WHITE_LOGO_URL : BLUE_LOGO_URL;
}

function createHemingwaiBadge(data) {
    const badge = document.createElement('span');
    badge.className = 'hemingwai-badge';

    const img = document.createElement('img');
    img.className = 'hemingwai-badge-logo';
    img.alt = 'HemingwAI';
    badge.appendChild(img);

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'hemingwai-badge-score';
    badge.appendChild(scoreSpan);

    updateHemingwaiBadge(badge, data);
    attachPopoverHandlersToBadge(badge, data);
    badge.dataset.hemingwaiPopoverAttached = 'true';

    return badge;
}

function attachInlineBadgeToHeadline(headlineEl, data) {
    const badge = createHemingwaiBadge(data);
    badge.classList.add('hemingwai-badge-inline');
    headlineEl.insertAdjacentElement('afterend', badge);
    headlineEl.dataset.hemingwaiBadgeAttached = 'true';
    headlineEl.dataset.hemingwai = "processed";
    return badge;
}

function attachInlineBadgeToArticleHeadline(h1El, data) {
    if (!h1El) return null;

    if (h1El.dataset.hemingwaiBadgeAttached === 'true') {
        const existing = h1El.querySelector('.hemingwai-badge');
        if (existing) {
            updateHemingwaiBadge(existing, data);
            return existing;
        }
    }

    const badge = createHemingwaiBadge(data);
    badge.classList.add('hemingwai-badge-inline', 'hemingwai-badge-article');

    h1El.appendChild(document.createTextNode(' '));
    h1El.appendChild(badge);

    h1El.dataset.hemingwaiBadgeAttached = 'true';
    return badge;
}


// ========================================================
// RENDERING UI (Badge Logic)
// ========================================================

function renderArticleUI(data) {
    const h1 = document.querySelector('h1');
    if (!h1) return;

    if (h1.dataset.hemingwaiBadgeAttached === 'true') return;
    attachInlineBadgeToArticleHeadline(h1, data);
}

function renderListBadge(anchor, data) {
    attachInlineBadgeToHeadline(anchor, data);
}

function markLinkDebugState(element, state) {
    if (!DEBUG_MODE) return;
    if (!element) return;
    element.style.outline = 'none';

    switch (state) {
        case 'candidate':
            element.style.outline = '3px solid #dc3545'; 
            break;
        case 'no_score':
            element.style.outline = '3px solid #ffc107';
            break;
        case 'analyzed':
            element.style.outline = '3px solid #28a745';
            break;
        case 'none':
        default:
            element.style.outline = 'none';
            break;
    }
}

// ========================================================
// SIDEBAR (CHAT) UI & LOGIC
// ========================================================

let hemingwaiSidebarInstance = null;

function ensureHemingwaiSidebar() {
    if (!hemingwaiSidebarInstance) {
        hemingwaiSidebarInstance = new HemingwaiSidebar();
        hemingwaiSidebarInstance.init();
    }
    return hemingwaiSidebarInstance;
}

class HemingwaiSidebar {
    constructor() {
        this.isOpen = false;
        this.isUnlocked = false;
        this.newsId = null;
        this.newsData = null;
        this.messages = []; // {role: 'user'|'assistant', content: string}
        this.sidebarHost = null;
        this.shadowRoot = null;
        this.toggleButton = null;
        this.isLoading = false;
        this.sidebarWidth = 350; // default width
        this.isResizing = false;
        this._onResizeMouseMove = null;
        this._onResizeMouseUp = null;
        this._initialized = false;
        this.currentContextUrl = null;
    }

    async init() {
        if (this._initialized) return;
        this._initialized = true;

        // Load width from storage
        chrome.storage.local.get("hemingwaiSidebarWidth", (result) => {
            if (result && typeof result.hemingwaiSidebarWidth === "number") {
                this.sidebarWidth = result.hemingwaiSidebarWidth;
            }
        });

        // Create Toggle Button
        this.createToggleButton();

        // Check initial auth status
        chrome.runtime.sendMessage({ type: "CHECK_AUTH_STATUS" }, (response) => {
            if (response && response.isUnlocked) {
                this.isUnlocked = true;
            }
        });
    }

    createToggleButton() {
        const btn = document.createElement('div');
        btn.id = 'hemingwai-sidebar-toggle';
        
        // Styles for the button (inline to ensure visibility)
        Object.assign(btn.style, {
            position: 'fixed',
            top: '50%',
            right: '0',
            transform: 'translateY(-50%)',
            width: '40px',
            height: '100px',
            backgroundColor: '#001a33',
            borderTopLeftRadius: '8px',
            borderBottomLeftRadius: '8px',
            boxShadow: '-2px 0 8px rgba(0,0,0,0.3)',
            border: '2px solid #d2d209', // Brand yellow border
            borderRight: 'none',
            zIndex: '2147483646', // Just below max
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'right 0.3s ease'
        });

        // Icon/Logo inside button
        const img = document.createElement('img');
        img.src = WHITE_LOGO_URL;
        img.style.width = '24px';
        img.style.height = 'auto';
        btn.appendChild(img);
        
        btn.addEventListener('click', () => this.toggleSidebar());
        
        // Stop propagation to prevent clicks from reaching underlying page elements
        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(evt => {
            btn.addEventListener(evt, (e) => e.stopPropagation(), { capture: false });
        });

        document.body.appendChild(btn);
        this.toggleButton = btn;
    }

    toggleSidebar() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    async openWithUrl(url) {
        const targetUrl = url || window.location.href;
        const contextChanged = (this.currentContextUrl !== targetUrl);
        
        if (contextChanged) {
            this.currentContextUrl = targetUrl;
            // Reset state
            this.newsId = null;
            this.newsData = null;
            this.messages = [];
            this.isLoading = false;
        }
        
        if (this.isOpen && contextChanged) {
             this.close();
        }
        
        await this.open();
        
        // Focus input
        setTimeout(() => {
            if (this.shadowRoot) {
                const input = this.shadowRoot.querySelector('#chat-input');
                if (input && !input.disabled) {
                    input.focus();
                }
            }
        }, 0);
    }

    async open() {
        if (this.isOpen) return;
        
        if (!this.sidebarHost) {
            this.createSidebarDOM();
        }

        this.isOpen = true;
        this.sidebarHost.style.display = 'block';
        this.toggleButton.style.display = 'none'; // Hide toggle when open

        // Shift page content
        document.documentElement.style.transition = 'margin-right 0.3s ease';
        document.documentElement.style.marginRight = `${this.sidebarWidth}px`;

        // If not loaded, fetch context
        const targetUrl = this.currentContextUrl || window.location.href;

        if (!this.newsData) {
            this.renderLoading();
            const response = await sendMessageAsync({ 
                type: "NEWS_CONTEXT_REQUEST", 
                url: targetUrl 
            });

            if (response && response.ok && response.news) {
                this.newsData = response.news;
                this.newsId = response.news._id || response.news.id;
                this.messages.push({ 
                    role: 'assistant', 
                    content: `Hola. Estoy listo para responder preguntas sobre esta noticia: "${this.newsData.titulo || 'Sin título'}".` 
                });
                this.render();
            } else {
                this.renderError("No se pudo cargar el análisis de esta noticia. Asegúrate de que está en nuestra base de datos.");
            }
        }
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.sidebarHost.style.display = 'none';
        this.toggleButton.style.display = 'flex';
        
        document.documentElement.style.marginRight = '0px';
    }

    createSidebarDOM() {
        this.sidebarHost = document.createElement('div');
        this.sidebarHost.id = 'hemingwai-sidebar-host';
        Object.assign(this.sidebarHost.style, {
            position: 'fixed',
            top: '0',
            right: '0',
            width: `${this.sidebarWidth}px`,
            height: '100vh',
            zIndex: '2147483647',
            backgroundColor: '#001a33', // Fallback
            display: 'none',
            boxShadow: '-4px 0 12px rgba(0,0,0,0.4)'
        });
        this.sidebarHost.style.pointerEvents = 'auto';

        // Stop propagation to prevent clicks from reaching underlying page elements
        const stopEvents = (e) => {
            e.stopPropagation();
        };
        // Exclude mousedown from here for the resize handle, handled separately or inside
        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(evt => {
            this.sidebarHost.addEventListener(evt, stopEvents, { capture: false });
        });

        this.shadowRoot = this.sidebarHost.attachShadow({ mode: 'open' });
        
        // Inject Styles
        const style = document.createElement('style');
        style.textContent = `
            :host {
                font-family: system-ui, -apple-system, sans-serif;
                color: white;
                background-color: #001a33;
                display: flex;
                flex-direction: column;
                height: 100%;
                box-sizing: border-box;
                pointer-events: auto;
            }
            * { box-sizing: border-box; }
            
            /* Resize Handle */
            .resize-handle {
                position: absolute;
                left: 0;
                top: 0;
                bottom: 0;
                width: 6px;
                background-color: #d2d209;
                cursor: col-resize;
                z-index: 999;
                opacity: 0.6;
                transition: opacity 0.2s;
            }
            .resize-handle:hover {
                opacity: 1;
                box-shadow: 0 0 4px #d2d209;
            }

            /* Header */
            .header {
                padding: 16px;
                border-bottom: 2px solid #d2d209;
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: #001a33;
                pointer-events: auto;
            }
            .header h2 {
                margin: 0;
                font-size: 18px;
                color: #d2d209;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .close-btn {
                background: none;
                border: none;
                color: rgba(255,255,255,0.7);
                font-size: 24px;
                cursor: pointer;
                line-height: 1;
            }
            .close-btn:hover { color: white; }

            /* Content Area */
            .content {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 12px;
                background: #0e2f56; /* Slightly lighter blue */
                position: relative;
                pointer-events: auto;
            }

            /* Messages */
            .message {
                max-width: 85%;
                padding: 10px 14px;
                border-radius: 12px;
                font-size: 14px;
                line-height: 1.4;
                word-wrap: break-word;
            }
            .message.user {
                align-self: flex-end;
                background-color: #d2d209;
                color: #001a33;
                border-bottom-right-radius: 2px;
            }
            .message.assistant {
                align-self: flex-start;
                background-color: white;
                color: #001a33;
                border-bottom-left-radius: 2px;
            }
            
            /* Markdown basic styles for assistant */
            .message.assistant p { margin: 0 0 8px 0; }
            .message.assistant p:last-child { margin-bottom: 0; }
            .message.assistant strong { font-weight: 700; }
            .message.assistant ul { padding-left: 20px; margin: 4px 0; }
            .message.assistant li { margin-bottom: 4px; }

            /* Input Area */
            .input-area {
                padding: 16px;
                border-top: 1px solid rgba(255,255,255,0.1);
                background: #001a33;
                display: flex;
                gap: 8px;
                pointer-events: auto;
            }
            input {
                flex: 1;
                padding: 10px;
                border-radius: 20px;
                border: 1px solid #d2d209;
                background: white;
                color: #001a33;
                font-size: 14px;
                outline: none;
            }
            button.send-btn {
                background: #d2d209;
                color: #001a33;
                border: none;
                border-radius: 20px;
                padding: 0 16px;
                font-weight: bold;
                cursor: pointer;
            }
            button.send-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            /* Lock Screen */
            .lock-overlay {
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0, 26, 51, 0.95);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
                padding: 20px;
                pointer-events: auto;
            }
            .lock-card {
                background: #0e2f56;
                padding: 24px;
                border-radius: 16px;
                border: 1px solid rgba(210, 210, 9, 0.5);
                display: flex;
                flex-direction: column;
                align-items: center;
                width: 90%;
                max-width: 280px;
                text-align: center;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            }
            .lock-card h3 { 
                color: #d2d209; 
                margin: 0 0 12px 0;
                font-size: 18px;
            }
            .lock-card p {
                font-size: 13px;
                margin: 0 0 16px 0;
                color: rgba(255,255,255,0.9);
                line-height: 1.4;
            }
            .lock-input { 
                flex: 0 0 auto; /* Override generic flex:1 */
                height: 38px;
                width: 100%;
                max-width: 240px;
                margin-bottom: 12px; 
                text-align: center; 
            }
            .lock-error { color: #ff6b6b; font-size: 12px; margin-top: 8px; }

            /* Utils */
            .loading { text-align: center; color: #d2d209; font-size: 12px; margin-top: 8px; }
            .error-msg { color: #ff6b6b; padding: 10px; text-align: center; background: rgba(0,0,0,0.2); border-radius: 8px; }
        `;
        
        this.shadowRoot.appendChild(style);
        
        // Resize Handle
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        resizeHandle.addEventListener('mousedown', (e) => this.startResizing(e));
        // Prevent click propagation on handle too
        resizeHandle.addEventListener('click', (e) => e.stopPropagation());

        this.shadowRoot.appendChild(resizeHandle);

        // Container
        this.container = document.createElement('div');
        this.container.style.height = '100%';
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        // Add padding left to avoid content overlapping with handle
        this.container.style.paddingLeft = '6px'; 
        this.shadowRoot.appendChild(this.container);

        document.body.appendChild(this.sidebarHost);
        this.render(); // Initial render structure
    }

    startResizing(e) {
        e.preventDefault();
        e.stopPropagation();
        this.isResizing = true;
        
        // Disable transition during drag for instant responsiveness
        document.documentElement.style.transition = 'none';
        
        // Bind global listeners
        this._onResizeMouseMove = (ev) => this.handleResizeMouseMove(ev);
        this._onResizeMouseUp = (ev) => this.handleResizeMouseUp(ev);
        
        window.addEventListener('mousemove', this._onResizeMouseMove, { capture: true });
        window.addEventListener('mouseup', this._onResizeMouseUp, { capture: true });
        
        // Add a class to body to force cursor everywhere
        document.body.style.cursor = 'col-resize';
    }

    handleResizeMouseMove(e) {
        if (!this.isResizing) return;
        
        const viewportWidth = window.innerWidth;
        const mouseX = e.clientX;
        
        const MIN_WIDTH = 280;
        const MAX_WIDTH = 600;
        
        // Sidebar is on the right, so width is distance from right edge
        let newWidth = viewportWidth - mouseX;
        newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
        
        this.sidebarWidth = newWidth;
        this.sidebarHost.style.width = `${newWidth}px`;
        document.documentElement.style.marginRight = `${newWidth}px`;
    }

    handleResizeMouseUp(e) {
        if (!this.isResizing) return;

        this.isResizing = false;
        
        // Re-enable smooth transition for future open/close actions
        document.documentElement.style.transition = 'margin-right 0.3s ease';
        
        // Remove global listeners
        if (this._onResizeMouseMove) {
            window.removeEventListener('mousemove', this._onResizeMouseMove, { capture: true });
            this._onResizeMouseMove = null;
        }
        if (this._onResizeMouseUp) {
            window.removeEventListener('mouseup', this._onResizeMouseUp, { capture: true });
            this._onResizeMouseUp = null;
        }
        
        document.body.style.cursor = '';

        // Save preference
        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ hemingwaiSidebarWidth: this.sidebarWidth });
        }
        
        if (e) {
            e.stopPropagation();
        }
    }

    render() {
        if (!this.shadowRoot) return;

        // Header
        const header = `
            <div class="header">
                <h2>HemingwAI</h2>
                <button class="close-btn">×</button>
            </div>
        `;

        // Determine content state
        let contentInner = '';
        
        if (!this.newsData && !this.isLoading) {
             contentInner = `<div class="loading">Cargando contexto...</div>`;
        } else if (this.messages.length > 0) {
            contentInner = this.messages.map(m => {
                // Simple markdown-ish render for assistant
                let htmlContent = m.content;
                if (m.role === 'assistant') {
                    htmlContent = htmlContent
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\n/g, '<br>');
                }
                return `<div class="message ${m.role}">${htmlContent}</div>`;
            }).join('');
        }

        if (this.isLoading) {
            contentInner += `<div class="loading">HemingwAI está escribiendo...</div>`;
        }

        const chatArea = `
            <div class="content" id="chat-content">
                ${contentInner}
                ${!this.isUnlocked ? this.getLockScreenHTML() : ''}
            </div>
            <div class="input-area">
                <input type="text" id="chat-input" placeholder="Pregunta sobre la noticia..." ${!this.isUnlocked ? 'disabled' : ''}>
                <button class="send-btn" id="send-btn" ${!this.isUnlocked ? 'disabled' : ''}>Enviar</button>
            </div>
        `;

        this.container.innerHTML = header + chatArea;

        // Bind Events
        this.shadowRoot.querySelector('.close-btn').onclick = () => this.close();
        
        const input = this.shadowRoot.querySelector('#chat-input');
        const sendBtn = this.shadowRoot.querySelector('#send-btn');
        const contentDiv = this.shadowRoot.querySelector('#chat-content');

        // Scroll to bottom
        contentDiv.scrollTop = contentDiv.scrollHeight;

        if (this.isUnlocked) {
            const handleSend = () => {
                const text = input.value.trim();
                if (text) {
                    this.sendMessage(text);
                    input.value = '';
                }
            };
            
            sendBtn.onclick = handleSend;
            input.onkeydown = (e) => {
                if (e.key === 'Enter') handleSend();
            };
        } else {
            // Lock screen events
            const lockBtn = this.shadowRoot.querySelector('#lock-btn');
            const lockInput = this.shadowRoot.querySelector('#lock-input');
            if (lockBtn && lockInput) {
                const handleUnlock = () => {
                    this.unlock(lockInput.value);
                };
                lockBtn.onclick = handleUnlock;
                lockInput.onkeydown = (e) => { if (e.key === 'Enter') handleUnlock(); };
            }
        }
    }

    getLockScreenHTML() {
        return `
            <div class="lock-overlay">
                <div class="lock-card">
                    <h3>🔒 Chat Privado</h3>
                    <p>Introduce la contraseña para acceder al asistente.</p>
                    <input type="password" id="lock-input" class="lock-input" placeholder="Contraseña...">
                    <button id="lock-btn" class="send-btn">Desbloquear</button>
                    <div id="lock-error" class="lock-error"></div>
                </div>
            </div>
        `;
    }

    renderLoading() {
        if (!this.container) return;
        const content = this.shadowRoot.querySelector('.content');
        if (content) {
            content.innerHTML += `<div class="loading">Cargando...</div>`;
        }
    }

    renderError(msg) {
        if (!this.container) return;
        const content = this.shadowRoot.querySelector('.content');
        if (content) {
            content.innerHTML = `<div class="error-msg">${msg}</div>`;
        }
    }

    async unlock(password) {
        const errorEl = this.shadowRoot.querySelector('#lock-error');
        if (errorEl) errorEl.textContent = "Verificando...";

        const response = await sendMessageAsync({ 
            type: "VERIFY_PASSWORD", 
            password: password 
        });

        if (response && response.ok) {
            this.isUnlocked = true;
            this.render(); // Re-render to remove lock screen
        } else {
            if (errorEl) errorEl.textContent = response.error || "Contraseña incorrecta";
        }
    }

    async sendMessage(text) {
        this.messages.push({ role: 'user', content: text });
        this.isLoading = true;
        this.render(); // Update UI immediately

        const response = await sendMessageAsync({
            type: "NEWS_CHAT_MESSAGE",
            newsId: this.newsId,
            userMessage: text,
            previousMessages: this.messages.slice(0, -1) // Send history excluding current user msg (optional, or send all)
            // Note: server expects previousMessages to exclude the current one which is passed in 'userMessage'
        });

        this.isLoading = false;

        if (response && response.ok) {
            this.messages.push({ role: 'assistant', content: response.assistantMessage });
        } else {
            const error = response.error === "AUTH_REQUIRED" 
                ? "Sesión expirada. Por favor desbloquea de nuevo." 
                : "Error al conectar con HemingwAI.";
            
            this.messages.push({ role: 'assistant', content: `⚠️ ${error}` });
            
            if (response.error === "AUTH_REQUIRED") {
                this.isUnlocked = false;
            }
        }
        this.render();
    }
}


// ========================================================
// LÓGICA DE DETECCIÓN & SCAN (Standard)
// ========================================================

function isNewsArticle() {
    const url = new URL(window.location.href);
    const path = url.pathname;
    
    if (path === '/' || path === '/index.html') return false;

    const ogType = getOgType();
    const hasDate = hasPublishDateMeta();
    const jsonLdCount = getNewsArticleLdJsonCount();
    const articleTags = getArticleTagCount();

    if (ogType === 'article') return true;
    if (hasDate && articleTags < 10) return true;
    if (jsonLdCount > 0 && jsonLdCount < 5 && hasDate) return true;
    
    if (ogType === 'website') return false;

    return false;
}

async function processArticlePage() {
    console.log("HemingwAI: Artículo detectado. Consultando API...");
    
    // Inicializar Sidebar SI es noticia
    const sidebar = ensureHemingwaiSidebar();

    const currentUrl = window.location.href;
    const currentUrlNorm = normalizeUrl(currentUrl);

    try {
        const response = await fetch(API_ENDPOINT_BATCH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: [currentUrl] })
        });

        if (!response.ok) return;

        const data = await response.json();
        const resultados = data.resultados || [];
        
        const match = resultados.find(r => normalizeUrl(r.url) === currentUrlNorm);

        if (match && match.id) {
            console.log("HemingwAI: Resultado encontrado", match);
            renderArticleUI(match);
        }

    } catch (error) {
        console.error("HemingwAI: Error processArticlePage", error);
    }
}

async function scanListingPage() {
    console.log("HemingwAI: Escaneando listado/portada...");
    
    const anchors = Array.from(document.querySelectorAll('a'));
    
    const allCandidates = [];
    const currentOrigin = window.location.origin;

    for (const a of anchors) {
        if (a.dataset.hemingwaiBadgeAttached === 'true') continue;
        
        const href = a.href;
        if (!href) continue;

        try {
            const urlObj = new URL(href, currentOrigin);
            if (urlObj.origin !== currentOrigin) continue;
            if (urlObj.pathname === '/' || urlObj.pathname === '') continue;
            if (urlObj.hash) continue;

            const rect = a.getBoundingClientRect();
            const absoluteTop = window.scrollY + rect.top;

            const anchorText = (a.textContent || "").trim();
            const heading = a.closest('h1, h2, h3');
            const headingText = heading ? heading.textContent.trim() : anchorText;
            
            if (headingText.length < 20 && !a.querySelector('img')) continue; 
            
            const fullUrl = urlObj.href;
            const normUrlDedup = normalizeUrlForDedup(fullUrl);

            allCandidates.push({
                fullUrl: fullUrl,
                normUrlDedup: normUrlDedup,
                anchor: a,
                top: absoluteTop
            });

            if (DEBUG_MODE) {
                markLinkDebugState(a, 'candidate');
            }

        } catch (e) { }
    }

    console.log("HemingwAI: candidatos listados ->", allCandidates.length);

    allCandidates.sort((a, b) => a.top - b.top);

    const uniqueUrlsToQuery = []; 
    const seenDedupUrls = new Set();
    const urlToAnchorMap = new Map();

    for (const cand of allCandidates) {
        if (!urlToAnchorMap.has(cand.normUrlDedup)) {
            urlToAnchorMap.set(cand.normUrlDedup, cand.anchor);
        }
        
        if (!seenDedupUrls.has(cand.normUrlDedup)) {
            seenDedupUrls.add(cand.normUrlDedup);
            if (uniqueUrlsToQuery.length < MAX_URLS_PER_PAGE) {
                uniqueUrlsToQuery.push(cand.fullUrl);
            }
        }
    }

    if (uniqueUrlsToQuery.length === 0) return;

    console.log(`HemingwAI: Consultando batch para ${uniqueUrlsToQuery.length} URLs únicas...`);

    try {
        const response = await fetch(API_ENDPOINT_BATCH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: uniqueUrlsToQuery })
        });

        if (!response.ok) return;

        const data = await response.json();
        const resultados = data.resultados || [];

        let foundCount = 0;
        for (const res of resultados) {
            if (res.id) { 
                const resUrlDedup = normalizeUrlForDedup(res.url);
                const anchor = urlToAnchorMap.get(resUrlDedup);
                
                if (anchor) {
                    renderListBadge(anchor, res);
                    foundCount++;
                    
                    const hasScore = (res.puntuacion !== undefined && res.puntuacion !== null);
                    if (DEBUG_MODE) {
                        markLinkDebugState(anchor, hasScore ? 'analyzed' : 'no_score');
                    }

                    const state = hasScore ? "ANALIZADA" : "PENDIENTE";
                    console.log(`HemingwAI: URL ${state} ->`, res.url);
                }
            }
        }
        console.log(`HemingwAI: Se procesaron ${foundCount} noticias.`);

    } catch (error) {
        console.error("HemingwAI: Error batch listing", error);
    }
}

async function init() {
    const isNews = isNewsArticle();
    console.log("HemingwAI: isNewsArticle ->", isNews, window.location.href);

    if (isNews) {
        await processArticlePage();
    } else {
        await scanListingPage();
    }
}

if (window.requestIdleCallback) {
    window.requestIdleCallback(() => init());
} else {
    setTimeout(init, 1000);
}