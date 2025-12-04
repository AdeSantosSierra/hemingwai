// HemingwAI Extension - Content Script
// Detecta noticias y muestra su valoración de calidad.

// Configuración
const API_BASE = "https://hemingwai-backend-5vw6.onrender.com";
const API_ENDPOINT_BATCH = `${API_BASE}/api/check-urls`;
const ANALYSIS_BASE_URL = "https://hemingwai-frontend-5vw6.onrender.com/analisis/";
const MAX_URLS_PER_PAGE = 100; 
const LOGO_URL = chrome.runtime.getURL("logo_small.png");

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

// ========================================================
// UI HELPERS (INTERACTION & POPOVER)
// ========================================================

let currentPinnedBadge = null;
let activePopover = null;

function hidePopover(popoverEl) {
    if (!popoverEl) return;
    
    popoverEl.classList.remove('visible');
    // Remove from DOM after transition
    setTimeout(() => {
        if (popoverEl.parentNode) popoverEl.parentNode.removeChild(popoverEl);
        if (activePopover === popoverEl) activePopover = null;
    }, 150);
}

function closeAllHemingwaiPopovers() {
    // Unpin global
    if (currentPinnedBadge) {
        currentPinnedBadge.__pinned = false;
        currentPinnedBadge = null;
    }
    // Remove DOM elements
    const popovers = document.querySelectorAll('.hemingwai-popover');
    popovers.forEach(p => hidePopover(p));
    activePopover = null;
}

function showPopoverForBadge(badgeEl, data) {
    // 1. Clean up existing (non-pinned logic handled by caller, but safety check)
    // Actually, we usually want to close others first
    const existing = document.querySelectorAll('.hemingwai-popover');
    existing.forEach(el => el.remove());

    // 2. Create content
    const contentHtml = getPopoverContent(data);

    // 3. Create popover
    const popover = document.createElement('div');
    popover.className = 'hemingwai-popover';
    popover.innerHTML = contentHtml;

    // 4. Append
    document.body.appendChild(popover);

    // 5. Position
    const rect = badgeEl.getBoundingClientRect();
    const margin = 8;
    const windowWidth = window.innerWidth;

    const top = rect.bottom + margin;
    let left = rect.left;
    const popoverWidth = 320; // approximate or read from offsetWidth after append
    
    // Prevent overflow right
    if (left + popoverWidth + 16 > windowWidth) {
        left = windowWidth - popoverWidth - 16;
    }
    if (left < 16) left = 16;

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;

    // 6. Show
    void popover.offsetWidth; // Force reflow
    popover.classList.add('visible');
    activePopover = popover;

    return popover;
}

function attachPopoverHandlers(badgeEl, data) {
    let pinned = false;

    // Helper to get current popover for THIS badge
    // Since we destroy popovers, activePopover is the source of truth if it matches logic
    // But simplistically, we just show/hide.

    function openPopover() {
        showPopoverForBadge(badgeEl, data);
    }

    function closePopover() {
        if (activePopover) hidePopover(activePopover);
    }

    // Hover Handlers
    badgeEl.addEventListener('mouseenter', () => {
        if (!badgeEl.__pinned) {
            openPopover();
        }
    });

    badgeEl.addEventListener('mouseleave', () => {
        if (!badgeEl.__pinned) {
            closePopover();
        }
    });

    // Click Handler (Toggle Pin)
    badgeEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        // If another badge is pinned, unpin it
        if (currentPinnedBadge && currentPinnedBadge !== badgeEl) {
            currentPinnedBadge.__pinned = false;
            // Close that popover
            hidePopover(activePopover); 
        }

        // Toggle state
        pinned = !badgeEl.__pinned;
        badgeEl.__pinned = pinned;

        if (pinned) {
            currentPinnedBadge = badgeEl;
            openPopover(); // Ensure it's open
        } else {
            currentPinnedBadge = null;
            closePopover();
        }
    });
}

// Global Click Listener (Close if clicking outside)
document.addEventListener('click', (event) => {
    if (currentPinnedBadge) {
        const badge = currentPinnedBadge;
        // Check if click is inside badge or inside active popover
        const isBadge = badge.contains(event.target);
        const isPopover = activePopover && activePopover.contains(event.target);

        if (!isBadge && !isPopover) {
            badge.__pinned = false;
            currentPinnedBadge = null;
            if (activePopover) hidePopover(activePopover);
        }
    }
});

// Global Scroll Listener (Close everything)
window.addEventListener('scroll', () => {
    closeAllHemingwaiPopovers();
}, { passive: true });


// ========================================================
// BADGE CREATION & WRAPPING
// ========================================================

function getBadgeClass(score) {
    if (score >= 70) return 'hemingwai-badge-high'; 
    if (score >= 50) return 'hemingwai-badge-medium'; 
    return 'hemingwai-badge-low'; 
}

function getBadgeColorHex(score) {
    if (score >= 70) return '#28a745';
    if (score >= 50) return '#ffc107';
    return '#dc3545';
}

function createHemingwaiBadge(data) {
    const isPending = (data.puntuacion === undefined || data.puntuacion === null || String(data.puntuacion).trim() === '');

    const badge = document.createElement('div');
    // Default classes
    badge.className = 'hemingwai-badge';

    const img = document.createElement('img');
    img.src = LOGO_URL;
    img.alt = 'HemingwAI';
    img.className = 'hemingwai-badge-logo';
    badge.appendChild(img);

    if (isPending) {
        badge.classList.add('hemingwai-badge-pending');
        badge.title = "HemingwAI: Pendiente de análisis";
    } else {
        const score = data.puntuacion;
        badge.classList.add(getBadgeClass(score));
        badge.title = `Puntuación HemingwAI: ${score}/100`;

        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'hemingwai-badge-score';
        scoreSpan.textContent = score;
        badge.appendChild(scoreSpan);
    }

    return badge;
}

function getPopoverContent(data) {
    const isPending = (data.puntuacion === undefined || data.puntuacion === null || String(data.puntuacion).trim() === '');
    const id = data.id || '';
    const linkUrl = `${ANALYSIS_BASE_URL}${id}`;
    
    let contentHtml = '';

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
        const score = data.puntuacion;
        const resumen = data.resumen_valoracion || "Sin resumen disponible.";
        const resumenTitular = data.resumen_valoracion_titular || "Sin análisis específico.";
        
        contentHtml = `
            <h4>Análisis HemingwAI</h4>
            <div class="hemingwai-section">
                <span class="hemingwai-label">PUNTUACIÓN GLOBAL</span>
                <span class="hemingwai-score" style="color: ${getBadgeColorHex(score)}">${score}/100</span>
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
            <div class="hemingwai-footer">
                 <a href="${linkUrl}" target="_blank" class="hemingwai-link">Ver ficha completa &rarr;</a>
            </div>
        `;
    }

    return contentHtml;
}

function attachOrUpdateBadge(wrapper, data) {
    let badge = wrapper.querySelector('.hemingwai-badge');
    
    // If badge exists, remove it to recreate (simpler for updating state/score)
    // Or just update content. Recreating is safer for pending->score transitions.
    if (badge) {
        badge.remove();
    }
    
    badge = createHemingwaiBadge(data);
    // Add inline class
    badge.classList.add('hemingwai-badge-inline');
    
    wrapper.appendChild(badge);
    
    // Attach handlers
    attachPopoverHandlers(badge, data);
    
    return badge;
}

function wrapHeadlineWithBadge(headlineEl, data) {
    // Check if already wrapped
    if (headlineEl.closest('.hemingwai-headline-wrapper')) {
        const wrapper = headlineEl.closest('.hemingwai-headline-wrapper');
        return attachOrUpdateBadge(wrapper, data);
    }
    
    // Create wrapper
    const wrapper = document.createElement('span');
    wrapper.className = 'hemingwai-headline-wrapper';
    
    // Insert wrapper before headline
    if (headlineEl.parentNode) {
        headlineEl.parentNode.insertBefore(wrapper, headlineEl);
        // Move headline into wrapper
        wrapper.appendChild(headlineEl);
        
        // Attach badge
        attachOrUpdateBadge(wrapper, data);
    }
}


// ========================================================
// RENDERING UI
// ========================================================

function renderArticleUI(data) {
    const h1 = document.querySelector('h1');
    if (!h1 || h1.dataset.hemingwai === "processed") return;
    
    h1.dataset.hemingwai = "processed";
    wrapHeadlineWithBadge(h1, data);
}

function renderListBadge(anchor, data) {
    if (anchor.dataset.hemingwai === "processed") return;
    anchor.dataset.hemingwai = "processed";
    
    wrapHeadlineWithBadge(anchor, data);
}


// ========================================================
// LÓGICA DE DETECCIÓN & SCAN (Same as before)
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
        if (a.dataset.hemingwai === "processed") continue;
        
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
                    
                    const state = (res.puntuacion !== undefined && res.puntuacion !== null) ? "ANALIZADA" : "PENDIENTE";
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