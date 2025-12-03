// HemingwAI Extension - Content Script
// Detecta noticias y muestra su valoración de calidad.

// Configuración
const API_BASE = "https://hemingwai-backend-5vw6.onrender.com";
const API_ENDPOINT_BATCH = `${API_BASE}/api/check-urls`;
const MAX_URLS_PER_PAGE = 50;
const LOGO_URL = chrome.runtime.getURL("logo_small.png");

// ========================================================
// HELPERS
// ========================================================

/**
 * Normaliza una URL para comparaciones con la API (Backend).
 * Mantiene origin + pathname (sin query params ni hash).
 * NO modifica trailing slashes para coincidir con lo que espera el backend.
 */
function normalizeUrl(urlStr) {
    try {
        const u = new URL(urlStr);
        return u.origin + u.pathname;
    } catch (e) {
        return urlStr;
    }
}

/**
 * Normaliza una URL para deduplicación local en el frontend.
 * Elimina trailing slashes del pathname para agrupar /path y /path/.
 */
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
// UI HELPERS
// ========================================================

function getBadgeClass(score) {
    if (score >= 70) return 'hemingwai-badge-high'; // Verde
    if (score >= 50) return 'hemingwai-badge-medium'; // Amarillo
    return 'hemingwai-badge-low'; // Rojo
}

function getBadgeColorHex(score) {
    if (score >= 70) return '#28a745';
    if (score >= 50) return '#ffc107';
    return '#dc3545';
}

/**
 * Crea el elemento visual del badge.
 * Caso A: Puntuación numérica.
 * Caso B: Logo (pendiente).
 */
function createBadgeElement(data, isSmall = false) {
    const badge = document.createElement('span');
    const isPending = (data.puntuacion === undefined || data.puntuacion === null);

    let baseClass = 'hemingwai-badge';
    if (isSmall) baseClass += ' hemingwai-badge-small';

    if (isPending) {
        // CASO B: Registrada pero no analizada
        badge.className = `${baseClass} hemingwai-badge-pending`;
        const img = document.createElement('img');
        img.src = LOGO_URL;
        img.alt = 'HemingwAI';
        badge.appendChild(img);
        badge.title = "Noticia registrada en HemingwAI (pendiente de análisis)";
    } else {
        // CASO A: Analizada
        const score = data.puntuacion;
        badge.className = `${baseClass} ${getBadgeClass(score)}`;
        badge.textContent = score;
        badge.title = `Puntuación HemingwAI: ${score}/100`;
    }

    return badge;
}

/**
 * Genera el contenido HTML del popover.
 */
function getPopoverContent(data) {
    const isPending = (data.puntuacion === undefined || data.puntuacion === null);
    const id = data.id || '';
    const linkUrl = `https://hemingwai-frontend-5vw6.onrender.com/analisis/${id}`;
    
    let contentHtml = '';

    if (isPending) {
        // CASO B
        contentHtml = `
            <h4>Análisis HemingwAI</h4>
            <div class="hemingwai-section">
                <div class="hemingwai-text">
                    Esta noticia está registrada en HemingwAI, pero todavía no ha sido analizada.
                </div>
            </div>
        `;
    } else {
        // CASO A
        const score = data.puntuacion;
        const resumen = data.resumen_valoracion || "Sin resumen disponible.";
        const resumenTitular = data.resumen_valoracion_titular || "Sin análisis específico.";
        
        contentHtml = `
            <h4>Análisis HemingwAI</h4>
            <div class="hemingwai-section">
                <span class="hemingwai-label">Puntuación Global</span>
                <span class="hemingwai-text" style="font-size: 1.2em; font-weight: bold; color: ${getBadgeColorHex(score)}">${score}/100</span>
            </div>
            <div class="hemingwai-section">
                <span class="hemingwai-label">Resumen</span>
                <div class="hemingwai-text">${resumen}</div>
            </div>
            <div class="hemingwai-section">
                <span class="hemingwai-label">Análisis del Titular</span>
                <div class="hemingwai-text">${resumenTitular}</div>
            </div>
        `;
    }

    // Link común
    if (id) {
        contentHtml += `
            <div style="text-align: right; margin-top: 10px;">
                 <a href="${linkUrl}" target="_blank" class="hemingwai-link">Ver ficha completa &rarr;</a>
            </div>
        `;
    }

    return contentHtml;
}

/**
 * Adjunta la lógica de popover a un badge.
 * Retorna el wrapper que contiene badge + popover.
 * El popover se monta en document.body para evitar problemas de z-index (stacking context).
 */
function attachPopover(badge, data) {
    // Creamos el popover pero NO lo añadimos al wrapper, lo gestionaremos dinámicamente en body
    const popover = document.createElement('div');
    popover.className = 'hemingwai-popover';
    popover.innerHTML = getPopoverContent(data);

    const wrapper = document.createElement('span');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-flex'; 
    wrapper.style.verticalAlign = 'middle'; 
    wrapper.style.zIndex = '2147483647'; // High z-index para el badge wrapper
    
    wrapper.appendChild(badge);

    // Eventos Click
    badge.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault(); // Evita navegar si está dentro de un <a>

        // Si ya está visible y es ESTE mismo popover, lo cerramos
        if (popover.classList.contains('visible') && popover.parentNode === document.body) {
            closePopover(popover);
            return;
        }

        // Cerrar otros popovers abiertos
        document.querySelectorAll('.hemingwai-popover.visible').forEach(p => {
            closePopover(p);
        });

        // Mostrar este popover
        document.body.appendChild(popover);
        // Forzamos reflow para que la transición funcione si hay
        void popover.offsetWidth; 
        popover.classList.add('visible');
        
        // Posicionamiento
        const rect = badge.getBoundingClientRect();
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

        // Posición base: debajo del badge
        let top = rect.bottom + scrollTop + 8;
        let left = rect.left + scrollLeft;

        // Ajuste si se sale por la derecha
        // popover.offsetWidth puede ser 0 si no está visible, pero ya lo añadimos al DOM
        const popoverWidth = 320; // Ancho aproximado definido en CSS o dinámico
        if (rect.left + popoverWidth > window.innerWidth) {
             left = (rect.right + scrollLeft) - popoverWidth;
        }

        // Ajuste si se sale por abajo (opcional, por ahora simple)

        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;
    });

    // Cerrar al hacer click fuera
    // Usamos un listener global que verifica si el click fue fuera del popover Y del badge
    // Nota: Como el popover está en body, 'wrapper.contains' no incluye al popover.
    document.addEventListener('click', (e) => {
        if (popover.classList.contains('visible')) {
            if (!popover.contains(e.target) && !badge.contains(e.target)) {
                closePopover(popover);
            }
        }
    });

    return wrapper;
}

function closePopover(popover) {
    popover.classList.remove('visible');
    // Esperar a transición si la hay, o eliminar directamente
    // Para simplificar y evitar fugas de memoria, lo quitamos del DOM
    if (popover.parentNode) {
        popover.parentNode.removeChild(popover);
    }
}

// ========================================================
// RENDERING UI
// ========================================================

function renderArticleUI(data) {
    const h1 = document.querySelector('h1');
    if (!h1 || h1.dataset.hemingwai) return;

    h1.dataset.hemingwai = "active";
    
    // Crear componentes
    const badge = createBadgeElement(data, false); // Grande
    const wrapper = attachPopover(badge, data);
    
    h1.appendChild(wrapper);
}

function renderListBadge(anchor, data) {
    if (anchor.dataset.hemingwai === "active") return;
    anchor.dataset.hemingwai = "active";
    
    // Crear componentes
    const badge = createBadgeElement(data, true); // Pequeño
    const wrapper = attachPopover(badge, data);
    
    // Insertar en el DOM
    if (anchor.nextSibling) {
        anchor.parentNode.insertBefore(wrapper, anchor.nextSibling);
    } else {
        anchor.parentNode.appendChild(wrapper);
    }
}

// ========================================================
// LÓGICA DE DETECCIÓN & SCAN
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
        
        // Buscar coincidencia
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
    
    // 1. Recopilar Candidatos
    const allCandidates = [];
    const currentOrigin = window.location.origin;

    for (const a of anchors) {
        if (a.dataset.hemingwai === "active") continue;
        
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

    // 2. Ordenar por posición vertical (Top)
    // Esto asegura que al elegir "el primero" elegimos el que está más arriba visualmente.
    allCandidates.sort((a, b) => a.top - b.top);

    // 3. Seleccionar únicos y mapear
    // CAMBIO: urlToAnchorMap ahora guarda solo UN anchor (el primero/mejor) por URL
    const uniqueUrlsToQuery = []; 
    const seenDedupUrls = new Set();
    const urlToAnchorMap = new Map(); // DedupNormUrl -> SingleAnchor

    for (const cand of allCandidates) {
        // Solo guardamos el primer anchor que encontramos para esta URL
        if (!urlToAnchorMap.has(cand.normUrlDedup)) {
            urlToAnchorMap.set(cand.normUrlDedup, cand.anchor);
        }
        
        // Lógica de query batch (mantenemos hasta MAX)
        if (!seenDedupUrls.has(cand.normUrlDedup)) {
            seenDedupUrls.add(cand.normUrlDedup);
            if (uniqueUrlsToQuery.length < MAX_URLS_PER_PAGE) {
                uniqueUrlsToQuery.push(cand.fullUrl);
            }
        }
    }

    if (uniqueUrlsToQuery.length === 0) return;

    console.log(`HemingwAI: Consultando batch para ${uniqueUrlsToQuery.length} URLs únicas...`);

    // 4. Consultar API
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
                
                // CAMBIO: Obtenemos el anchor único
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

/**
 * Función principal de inicio.
 */
async function init() {
    const isNews = isNewsArticle();
    console.log("HemingwAI: isNewsArticle ->", isNews, window.location.href);

    if (isNews) {
        await processArticlePage();
    } else {
        await scanListingPage();
    }
}

// Ejecutar al cargar (idle)
if (window.requestIdleCallback) {
    window.requestIdleCallback(() => init());
} else {
    setTimeout(init, 1000);
}