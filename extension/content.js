// HemingwAI Extension - Content Script
// Detecta noticias y muestra su valoración de calidad.

// Configuración
const DEBUG_MODE = true; // Set to true to enable visual debug outlines
const API_BASE = "https://hemingwai-backend-5vw6.onrender.com";
const API_ENDPOINT_BATCH = `${API_BASE}/api/check-urls`;
const ANALYSIS_BASE_URL = "https://hemingwai-frontend-5vw6.onrender.com/analisis/";
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

function showPopoverForBadge(badgeEl, popoverEl) { // Note: we usually create popover here or pass it
    // Wait, the design requires dynamic content per badge.
    // We should probably recreate the popover content here.
    // But the attach function logic is "openPopover()" which calls "showPopoverForBadge"
    // Let's adapt.
    
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
            <div class="hemingwai-footer">
                 <a href="${linkUrl}" target="_blank" class="hemingwai-link">Ver ficha completa &rarr;</a>
            </div>
        `;
    }

    const popover = document.createElement('div');
    popover.className = 'hemingwai-popover';
    popover.innerHTML = contentHtml;
    
    // Popover self-hover logic (keep open if mouse moves to popover)
    popover.addEventListener('mouseenter', () => {
         // cancel any hide timer if we had one (we rely on badge leave)
         // Actually, if we leave badge, we close. We need a shared timer or logic.
         // Simplest: if we are pinned, we don't care.
         // If unpinned (hover mode): moving to popover should keep it open?
         // User: "mouseleave del badge → cerrar el pop-over SI no está “pineado”".
         // Typically user wants to be able to click links in popover.
         // But user instructions were strict: "Hover sobre la bolita... mouseleave del badge → cerrar".
         // If I strictly follow that, user can't click links in popover in hover mode.
         // I will assume standard behavior (bridge gap) is implied or user pins to click.
         // Given "Click la pinea...", user implies interaction requires pinning?
         // Let's stick to strict instruction: "mouseleave del badge → cerrar...".
         // But I'll add a small grace period just in case.
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

    // Create popover element ONCE or on demand? On demand is better for fresh data/DOM.
    // But we need reference. Let's create on open.
    
    function openPopover() {
        const popoverEl = createPopoverElement(data);
        
        // Add listeners to popover to allow hovering IT (standard UX, even if strict instructions said badge)
        // because otherwise links are unclickable without pinning.
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
            // Close others immediately
            const all = document.querySelectorAll('.hemingwai-popover');
            all.forEach(p => p.remove()); 
            activePopover = null;
        }

        pinned = !badgeEl.__pinned;
        badgeEl.__pinned = pinned;

        if (pinned) {
            currentPinnedBadge = badgeEl;
            // Ensure open and clear timers
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
    // We need to find the active popover for this badge.
    // activePopover global should be it.
    
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
        scoreSpan.style.display = 'inline-block'; // or inline
        badge.title = `Puntuación HemingwAI: ${score}/100`;
        badge.classList.remove('hemingwai-badge-pending'); // Remove pending class if present
    } else {
        scoreSpan.textContent = '';
        scoreSpan.style.display = 'none';
        badge.title = "HemingwAI: Pendiente de análisis";
        badge.classList.add('hemingwai-badge-pending'); // Add pending class
    }

    const { bgColor, useWhiteLogo } = getColorForScore(score);
    badge.style.backgroundColor = bgColor;

    // Text color adjustment (yellow bg needs dark text usually, others white)
    if (bgColor === '#ffc107') {
        badge.style.color = '#001a33'; // Corporate Blue for yellow
    } else {
        badge.style.color = '#ffffff'; // White for others
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
    
    // Attach Popover Handlers HERE
    attachPopoverHandlersToBadge(badge, data);
    badge.dataset.hemingwaiPopoverAttached = 'true';

    return badge;
}

function attachInlineBadgeToHeadline(headlineEl, data) {
    // Esta función solo se usa en listados (isNews === false)

    // Siempre creamos un badge nuevo para evitar inconsistencias
    const badge = createHemingwaiBadge(data);  // ya lleva attachPopoverHandlersToBadge dentro
    badge.classList.add('hemingwai-badge-inline');

    // Insertar justo después del enlace/titular
    headlineEl.insertAdjacentElement('afterend', badge);

    // Marcar el enlace como procesado por si en el futuro queremos evitar duplicados
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

    // Añadimos un espacio y el badge DENTRO del <h1>, al final del contenido
    h1El.appendChild(document.createTextNode(' '));
    h1El.appendChild(badge);

    h1El.dataset.hemingwaiBadgeAttached = 'true';
    return badge;
}


// ========================================================
// RENDERING UI
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

    // Reset outline to ensure clean state change
    element.style.outline = 'none';

    switch (state) {
        case 'candidate':
            // Red: Detected candidate, not confirmed in DB yet
            element.style.outline = '3px solid #dc3545'; 
            break;
        case 'no_score':
            // Yellow: In DB but no score (pending)
            element.style.outline = '3px solid #ffc107';
            break;
        case 'analyzed':
            // Green: In DB with score
            element.style.outline = '3px solid #28a745';
            break;
        case 'none':
        default:
            element.style.outline = 'none';
            break;
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