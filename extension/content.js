// HemingwAI Extension - Content Script
// Detecta noticias y muestra su valoración de calidad.

// Configuración
const SETTINGS = {
    env: "prod",
    debug: false
};

const ENV = {
    API_BASE: "https://hemingwai-backend.onrender.com",
    ANALYSIS_BASE_URL: "https://hemingwai-frontend.onrender.com"
};

// Promise para asegurar que la configuración de entorno esté lista antes de init()
const envReadyPromise = new Promise((resolve) => {
    try {
        chrome.storage.local.get(["hemingwaiEnv", "hemingwaiDebug"], (result) => {
            if (result) {
                if (result.hemingwaiEnv === 'dev') {
                    SETTINGS.env = 'dev';
                    ENV.API_BASE = "https://hemingwai-backend-5vw6.onrender.com";
                    ENV.ANALYSIS_BASE_URL = "https://hemingwai-frontend-5vw6.onrender.com";
                    console.log("[HemingwAI] Environment switched to DEV (backend-5vw6).");
                }
                
                if (result.hemingwaiDebug === true) {
                    SETTINGS.debug = true;
                    console.log("[HemingwAI] Debug Mode ENABLED.");
                }
            }
            resolve();
        });
    } catch (e) {
        // Contexto no válido o error de API, resolvemos igual para no bloquear
        resolve();
    }
});

const getApiEndpointBatch = () => `${ENV.API_BASE}/api/check-urls`;
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
        return {
            accentColor: '#15d7ff',
            textColor: '#050505',
            state: 'pending',
            useWhiteLogo: false
        };
    }

    const val = Number(score);
    if (isNaN(val)) {
        return {
            accentColor: '#15d7ff',
            textColor: '#050505',
            state: 'pending',
            useWhiteLogo: false
        };
    }

    // Semáforo (escala 0–10):
    // < 5: Rojo (Mala)
    // 5-6.9: Amarillo (Regular)
    // >= 7: Lima de marca (Buena)

    if (val < 5) {
        return {
            accentColor: '#f87171',
            textColor: '#f8fafc',
            state: 'low',
            useWhiteLogo: true
        };
    }
    if (val < 7) {
        return {
            accentColor: '#facc15',
            textColor: '#050505',
            state: 'medium',
            useWhiteLogo: false
        };
    }
    return {
        accentColor: '#d4e600',
        textColor: '#050505',
        state: 'high',
        useWhiteLogo: false
    };
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
    const popoverWidth = 340;

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
    const id = data.id || data._id || '';
    
    let linkUrl;
    try {
        if (id) {
            // Construcción robusta para /analisis/:id/
            const u = new URL(`/analisis/${id}/`, ENV.ANALYSIS_BASE_URL);
            linkUrl = u.href;
        } else {
            // Construcción robusta para /analisis/?url=...
            const u = new URL('/analisis/', ENV.ANALYSIS_BASE_URL);
            u.searchParams.set("url", data.url || window.location.href);
            linkUrl = u.href;
        }
    } catch (e) {
        linkUrl = "#";
        console.error("HemingwAI: Error constructing URL", e);
    }
    
    const scoreVal = data.puntuacion;
    const { accentColor, state } = getColorForScore(scoreVal);
    const stateLabel = isPending ? 'Pendiente' : 'Analisis listo';
    const stateChipClass = isPending ? '' : ' hemingwai-chip--accent';
    let contentHtml = `
        <div class="hemingwai-popover__header">
            <span class="hemingwai-chip hemingwai-chip--accent">HemingwAI</span>
            <span class="hemingwai-chip${stateChipClass}">${stateLabel}</span>
        </div>
    `;

    if (isPending) {
        contentHtml += `
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
                    Cuando el análisis esté disponible, aquí aparecerá una puntuación global de 0 a 10, un resumen y el análisis del titular.
                </div>
            </div>
        `;
    } else {
        const resumen = data.resumen_valoracion || "Sin resumen disponible.";
        const resumenTitular = data.resumen_valoracion_titular || "Sin análisis específico.";
        
        contentHtml += `
            <h4>Análisis HemingwAI</h4>
            <div class="hemingwai-section">
                <span class="hemingwai-label">PUNTUACIÓN GLOBAL</span>
                <span class="hemingwai-score" style="color: ${accentColor}">${scoreVal}/10</span>
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

    if (linkUrl && linkUrl !== "#") {
        contentHtml += `
            <div class="hemingwai-footer">
                 <a href="${linkUrl}" target="_blank" class="hemingwai-link">Ver ficha completa &rarr;</a>
                 <a href="#" class="hemingwai-link hemingwai-chat-link">Abrir chat &rarr;</a>
            </div>
        `;
    }

    const popover = document.createElement('div');
    popover.className = 'hemingwai-popover hemingwai-glass-panel';
    popover.dataset.state = state;
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
        badge.title = `Puntuación HemingwAI: ${score}/10`;
        badge.classList.remove('hemingwai-badge-pending');
    } else {
        scoreSpan.textContent = '';
        scoreSpan.style.display = 'none';
        badge.title = "HemingwAI: Pendiente de análisis";
        badge.classList.add('hemingwai-badge-pending');
    }

    const { accentColor, textColor, state, useWhiteLogo } = getColorForScore(score);
    badge.dataset.state = state;
    badge.style.setProperty('--hemingwai-badge-accent', accentColor);
    badge.style.color = textColor;

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
    if (!SETTINGS.debug) return;
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
        btn.setAttribute('aria-label', 'Abrir panel de chat de HemingwAI');
        
        // Styles for the button (inline to ensure visibility)
        Object.assign(btn.style, {
            position: 'fixed',
            top: '50%',
            right: '0',
            transform: 'translateY(-50%)',
            width: '48px',
            height: '132px',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0) 42%), linear-gradient(180deg, rgba(17,17,17,0.98), rgba(8,8,8,0.94))',
            borderTopLeftRadius: '18px',
            borderBottomLeftRadius: '18px',
            boxShadow: '-18px 0 42px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
            border: '1px solid rgba(212,230,0,0.22)',
            borderRight: 'none',
            backdropFilter: 'blur(18px) saturate(135%)',
            WebkitBackdropFilter: 'blur(18px) saturate(135%)',
            zIndex: '2147483646',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            transition: 'right 0.3s ease, box-shadow 0.2s ease, transform 0.2s ease'
        });

        // Icon/Logo inside button
        const img = document.createElement('img');
        img.src = WHITE_LOGO_URL;
        img.style.width = '22px';
        img.style.height = 'auto';
        img.style.filter = 'drop-shadow(0 0 12px rgba(212,230,0,0.22))';
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
            background: 'linear-gradient(160deg, #050505 0%, #0a0a0a 42%, #111111 100%)',
            display: 'none',
            boxShadow: '-20px 0 52px rgba(0,0,0,0.42)',
            borderLeft: '1px solid rgba(212,230,0,0.18)'
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
                --hw-primary: #d4e600;
                --hw-secondary: #15d7ff;
                --hw-bg: #050505;
                --hw-bg-elevated: #111111;
                --hw-bg-strong: #1b1b1b;
                --hw-text: #f3f4f6;
                --hw-text-muted: #9ca3af;
                --hw-border: rgba(255, 255, 255, 0.12);
                font-family: Inter, "Segoe UI", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
                color: var(--hw-text);
                background:
                    radial-gradient(circle at 22% 0%, rgba(212, 230, 0, 0.13), transparent 30%),
                    radial-gradient(circle at 100% 18%, rgba(21, 215, 255, 0.12), transparent 36%),
                    linear-gradient(160deg, #050505 0%, #0a0a0a 42%, #111111 100%);
                display: flex;
                flex-direction: column;
                height: 100%;
                box-sizing: border-box;
                pointer-events: auto;
            }
            * { box-sizing: border-box; }
            button, input { font: inherit; }
            ::selection {
                background: rgba(212, 230, 0, 0.24);
                color: var(--hw-text);
            }
            
            .resize-handle {
                position: absolute;
                left: 0;
                top: 0;
                bottom: 0;
                width: 6px;
                background: linear-gradient(180deg, rgba(212, 230, 0, 0.58), rgba(21, 215, 255, 0.42));
                cursor: col-resize;
                z-index: 999;
                opacity: 0.72;
                transition: opacity 0.2s, box-shadow 0.2s;
            }
            .resize-handle:hover {
                opacity: 1;
                box-shadow: 0 0 16px rgba(212, 230, 0, 0.32);
            }

            .header {
                position: relative;
                overflow: hidden;
                padding: 18px 18px 16px;
                border-bottom: 1px solid var(--hw-border);
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 16px;
                background:
                    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0) 44%),
                    rgba(11, 11, 11, 0.88);
                backdrop-filter: blur(16px) saturate(135%);
                -webkit-backdrop-filter: blur(16px) saturate(135%);
                pointer-events: auto;
            }
            .header::before {
                content: "";
                position: absolute;
                inset: 0;
                pointer-events: none;
                background-image:
                    linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
                background-size: 40px 40px;
                opacity: 0.14;
            }
            .header-copy {
                position: relative;
                z-index: 1;
                min-width: 0;
            }
            .header-eyebrow {
                font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.22em;
                text-transform: uppercase;
                color: var(--hw-primary);
            }
            .header h2 {
                margin: 0;
                margin-top: 7px;
                font-size: 24px;
                line-height: 1.05;
                font-weight: 800;
                letter-spacing: -0.03em;
                color: var(--hw-text);
            }
            .header-copy p {
                margin: 8px 0 0;
                font-size: 13px;
                line-height: 1.5;
                color: var(--hw-text-muted);
            }
            .close-btn {
                position: relative;
                z-index: 1;
                width: 36px;
                height: 36px;
                border-radius: 999px;
                border: 1px solid var(--hw-border);
                background: rgba(255, 255, 255, 0.05);
                color: var(--hw-text-muted);
                font-size: 22px;
                cursor: pointer;
                line-height: 1;
                transition: transform 0.16s ease, border-color 0.18s ease, color 0.18s ease, background-color 0.18s ease;
            }
            .close-btn:hover {
                transform: translateY(-1px);
                color: var(--hw-text);
                border-color: rgba(212, 230, 0, 0.26);
                background: rgba(212, 230, 0, 0.08);
            }

            .content {
                flex: 1;
                overflow-y: auto;
                padding: 18px;
                display: flex;
                flex-direction: column;
                gap: 14px;
                background: transparent;
                position: relative;
                pointer-events: auto;
            }
            .content::before {
                content: "";
                position: absolute;
                inset: 0;
                pointer-events: none;
                background:
                    radial-gradient(circle at 15% 15%, rgba(21, 215, 255, 0.08), transparent 26%),
                    radial-gradient(circle at 82% 78%, rgba(212, 230, 0, 0.1), transparent 30%);
                opacity: 0.95;
            }
            .content > * {
                position: relative;
                z-index: 1;
            }
            .content::-webkit-scrollbar {
                width: 10px;
            }
            .content::-webkit-scrollbar-track {
                background: transparent;
            }
            .content::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.12);
                border-radius: 999px;
                border: 2px solid transparent;
                background-clip: padding-box;
            }

            .message {
                max-width: 85%;
                padding: 12px 14px;
                border-radius: 18px;
                font-size: 14px;
                line-height: 1.55;
                word-wrap: break-word;
                border: 1px solid var(--hw-border);
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, 0.05),
                    0 10px 24px rgba(0, 0, 0, 0.16);
            }
            .message.user {
                align-self: flex-end;
                background: linear-gradient(90deg, #d4e600 0%, #c6dd00 100%);
                color: #050505;
                border-color: rgba(212, 230, 0, 0.3);
                border-bottom-right-radius: 6px;
            }
            .message.assistant {
                align-self: flex-start;
                color: var(--hw-text);
                background:
                    linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0) 46%),
                    rgba(17, 17, 17, 0.84);
                backdrop-filter: blur(14px) saturate(130%);
                -webkit-backdrop-filter: blur(14px) saturate(130%);
                border-bottom-left-radius: 6px;
            }
            
            .message.assistant p { margin: 0 0 8px 0; }
            .message.assistant p:last-child { margin-bottom: 0; }
            .message.assistant strong { font-weight: 700; }
            .message.assistant ul { padding-left: 20px; margin: 4px 0; }
            .message.assistant li { margin-bottom: 4px; }

            .input-area {
                position: relative;
                display: flex;
                gap: 10px;
                padding: 16px 18px 18px;
                border-top: 1px solid var(--hw-border);
                background:
                    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0) 44%),
                    rgba(10, 10, 10, 0.92);
                backdrop-filter: blur(16px) saturate(135%);
                -webkit-backdrop-filter: blur(16px) saturate(135%);
                pointer-events: auto;
            }
            .input-area::before {
                content: "";
                position: absolute;
                inset: 0;
                pointer-events: none;
                background-image:
                    linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
                background-size: 40px 40px;
                opacity: 0.12;
            }
            .input-area > * {
                position: relative;
                z-index: 1;
            }
            input {
                flex: 1;
                min-width: 0;
                min-height: 46px;
                padding: 0 16px;
                border-radius: 999px;
                border: 1px solid var(--hw-border);
                background: rgba(255, 255, 255, 0.04);
                color: var(--hw-text);
                font-size: 14px;
                outline: none;
                transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
            }
            input::placeholder {
                color: var(--hw-text-muted);
            }
            input:focus {
                border-color: rgba(212, 230, 0, 0.32);
                box-shadow: 0 0 0 2px rgba(212, 230, 0, 0.18);
                background: rgba(255, 255, 255, 0.06);
            }
            input:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            button.send-btn {
                min-width: 110px;
                min-height: 46px;
                padding: 0 18px;
                border: none;
                border-radius: 999px;
                background: linear-gradient(90deg, #d4e600 0%, #c6dd00 100%);
                color: #050505;
                font-weight: 800;
                letter-spacing: 0.06em;
                text-transform: uppercase;
                cursor: pointer;
                box-shadow: 0 12px 24px rgba(212, 230, 0, 0.22);
                transition: transform 0.16s ease, box-shadow 0.18s ease, opacity 0.18s ease;
            }
            button.send-btn:hover:not(:disabled) {
                transform: translateY(-1px);
                box-shadow: 0 16px 28px rgba(212, 230, 0, 0.28);
            }
            button.send-btn:active:not(:disabled) {
                transform: scale(0.98);
            }
            button.send-btn:disabled {
                opacity: 0.48;
                cursor: not-allowed;
                box-shadow: none;
            }

            .lock-overlay {
                position: absolute;
                inset: 0;
                background: rgba(5, 5, 5, 0.78);
                backdrop-filter: blur(14px);
                -webkit-backdrop-filter: blur(14px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
                padding: 20px;
                pointer-events: auto;
            }
            .lock-card {
                width: 100%;
                max-width: 308px;
                padding: 24px;
                border-radius: 22px;
                border: 1px solid rgba(212, 230, 0, 0.2);
                background:
                    linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0) 44%),
                    rgba(17, 17, 17, 0.9);
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, 0.05),
                    0 18px 42px rgba(0, 0, 0, 0.3);
                backdrop-filter: blur(18px) saturate(130%);
                -webkit-backdrop-filter: blur(18px) saturate(130%);
            }
            .lock-card h3 { 
                color: var(--hw-text);
                margin: 10px 0 12px 0;
                font-size: 22px;
                line-height: 1.1;
                letter-spacing: -0.03em;
            }
            .lock-card p {
                font-size: 13px;
                margin: 0 0 16px 0;
                color: var(--hw-text-muted);
                line-height: 1.5;
            }
            .lock-input { 
                flex: 0 0 auto;
                height: 44px;
                width: 100%;
                margin-bottom: 12px; 
                text-align: center;
            }
            .lock-error {
                min-height: 16px;
                color: #fca5a5;
                font-size: 12px;
                margin-top: 10px;
            }
            .status-card,
            .error-msg {
                border-radius: 18px;
                border: 1px solid var(--hw-border);
                background:
                    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0) 44%),
                    rgba(17, 17, 17, 0.84);
                padding: 16px;
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, 0.05),
                    0 12px 28px rgba(0, 0, 0, 0.18);
            }
            .status-card strong,
            .error-msg strong {
                display: block;
                margin-top: 10px;
                font-size: 15px;
                line-height: 1.35;
                color: var(--hw-text);
            }
            .status-card p,
            .error-msg p {
                margin: 10px 0 0;
                font-size: 13px;
                line-height: 1.55;
                color: var(--hw-text-muted);
            }
            .status-chip {
                display: inline-flex;
                align-items: center;
                min-height: 26px;
                padding: 0 10px;
                border-radius: 999px;
                border: 1px solid rgba(212, 230, 0, 0.24);
                background: rgba(212, 230, 0, 0.1);
                color: var(--hw-primary);
                font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.16em;
                text-transform: uppercase;
            }
            .status-chip--error {
                border-color: rgba(248, 113, 113, 0.24);
                background: rgba(248, 113, 113, 0.12);
                color: #fecaca;
            }
            .loading {
                text-align: center;
                color: var(--hw-text-muted);
                font-size: 13px;
            }
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
                <div class="header-copy">
                    <div class="header-eyebrow">AI newsroom</div>
                    <h2>HemingwAI</h2>
                    <p>Chat contextual sobre la noticia activa.</p>
                </div>
                <button class="close-btn" aria-label="Cerrar panel">×</button>
            </div>
        `;

        // Determine content state
        let contentInner = '';
        
        if (!this.newsData && !this.isLoading) {
             contentInner = `
                <div class="status-card">
                    <span class="status-chip">Preparando contexto</span>
                    <strong>Cargando noticia y señales</strong>
                    <p>Estamos recuperando el analisis para que el chat tenga el mismo contexto que la plataforma principal.</p>
                </div>
            `;
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
            contentInner += `
                <div class="status-card">
                    <span class="status-chip">Generando respuesta</span>
                    <strong>HemingwAI esta escribiendo</strong>
                    <p>El asistente esta sintetizando senales y contexto antes de responder.</p>
                </div>
            `;
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
                    <span class="status-chip">Acceso privado</span>
                    <h3>Desbloquea el chat</h3>
                    <p>Introduce la contraseña para acceder al asistente contextual de la extension.</p>
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
            content.innerHTML = `
                <div class="status-card">
                    <span class="status-chip">Cargando</span>
                    <strong>Recuperando datos</strong>
                    <p>Estamos conectando con HemingwAI para montar el contexto del chat.</p>
                </div>
            `;
        }
    }

    renderError(msg) {
        if (!this.container) return;
        const content = this.shadowRoot.querySelector('.content');
        if (content) {
            content.innerHTML = `
                <div class="error-msg">
                    <span class="status-chip status-chip--error">Error</span>
                    <strong>No se pudo abrir el contexto</strong>
                    <p>${msg}</p>
                </div>
            `;
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
        const response = await fetch(getApiEndpointBatch(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: [currentUrl] })
        });

        if (!response.ok) return;

        const data = await response.json();
        const resultados = data.resultados || [];
        
        const match = resultados.find(r => normalizeUrl(r.url) === currentUrlNorm);

        if (match && (match.id || match._id)) {
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

            if (SETTINGS.debug) {
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
        const response = await fetch(getApiEndpointBatch(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: uniqueUrlsToQuery })
        });

        if (!response.ok) return;

        const data = await response.json();
        const resultados = data.resultados || [];

        let foundCount = 0;
        for (const res of resultados) {
            if (res.id || res._id) { 
                const resUrlDedup = normalizeUrlForDedup(res.url);
                const anchor = urlToAnchorMap.get(resUrlDedup);
                
                if (anchor) {
                    renderListBadge(anchor, res);
                    foundCount++;
                    
                    const hasScore = (res.puntuacion !== undefined && res.puntuacion !== null);
                    if (SETTINGS.debug) {
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
    // Esperar a que se cargue la configuración de entorno
    await envReadyPromise;

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
