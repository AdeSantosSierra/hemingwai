// HemingwAI Extension - Content Script
// Detecta noticias y muestra su valoración de calidad.

// Configuración
const API_BASE = "https://hemingwai-backend-5vw6.onrender.com";
const API_ENDPOINT_SINGLE = `${API_BASE}/api/check-url`; // Deprecado, pero mantenido por si acaso
const API_ENDPOINT_BATCH = `${API_BASE}/api/check-urls`;
// const API_BASE = "http://localhost:3000"; // Para desarrollo local

const MAX_URLS_PER_PAGE = 50;

// ========================================================
// HELPERS
// ========================================================

/**
 * Normaliza una URL para comparaciones robustas.
 * Esquema: origin + pathname (sin query params ni hash).
 * @param {string} urlStr 
 * @returns {string}
 */
function normalizeUrl(urlStr) {
    try {
        const u = new URL(urlStr);
        // Aseguramos que no haya trailing slash si el backend es estricto, 
        // pero la implementación Python actual usa urlparse que mantiene lo que haya.
        // Lo más seguro es mantener pathname tal cual pero sin query.
        return u.origin + u.pathname;
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
            // Contamos ocurrencias simples o bloques
            // Para simplificar, si el script contiene el tipo, asumimos +1 (o más).
            // Pero queremos saber si es una lista larga.
            // Si el JSON es una lista de artículos, el string aparecerá muchas veces.
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
// LÓGICA DE DETECCIÓN
// ========================================================

/**
 * Detecta si la página actual es un artículo de noticias.
 * Utiliza heurísticas mejoradas para evitar falsos positivos en homepages.
 * @returns {boolean}
 */
function isNewsArticle() {
    const url = new URL(window.location.href);
    const path = url.pathname;
    
    // 1. Descarte rápido de Home y secciones obvias
    if (path === '/' || path === '/index.html') {
        // Excepción: Si explicitamente dice og:type="article", podría ser una "home" especial, 
        // pero muy raro. Asumimos False.
        return false;
    }

    // Patrones comunes de secciones (terminan en .html pero son listas)
    // Ejemplo: /deportes.html, /espana.html
    // Si no tienen señales fuertes de noticia, las descartaremos abajo.

    const ogType = getOgType();
    const hasDate = hasPublishDateMeta();
    const jsonLdCount = getNewsArticleLdJsonCount();
    const articleTags = getArticleTagCount();

    console.log("HemingwAI: Debug Detection ->", { 
        path, ogType, hasDate, jsonLdCount, articleTags 
    });

    // 2. Reglas de ACEPTACIÓN (Señales fuertes)
    
    // A) Open Graph explícito
    if (ogType === 'article') {
        return true;
    }

    // B) Metadatos de fecha + Estructura razonable
    // Si tiene fecha de publicación, es muy probable que sea noticia, 
    // a menos que sea un listado de archivo (raro tener meta datePublished global).
    // Reforzamos con que no haya un exceso de tags <article> (típico de grids).
    if (hasDate && articleTags < 10) {
        return true;
    }

    // C) JSON-LD NewsArticle específico
    // Si hay un bloque NewsArticle y no es una lista gigante
    if (jsonLdCount > 0 && jsonLdCount < 5 && hasDate) {
        return true;
    }

    // 3. Reglas de RECHAZO (Si no se cumplió lo anterior)
    
    if (ogType === 'website') {
        return false;
    }

    // Si llegamos aquí, no hay og:type=article, ni fecha clara.
    // Probablemente sea una sección o portada.
    return false;
}

// ========================================================
// UI RENDERING
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

function renderArticleUI(data) {
    const h1 = document.querySelector('h1');
    if (!h1 || h1.dataset.hemingwai) return;

    h1.dataset.hemingwai = "active";
    
    const puntuacion = data.puntuacion !== undefined ? data.puntuacion : '?';
    const resumen = data.resumen_valoracion || "Sin resumen disponible.";
    const resumenTitular = data.resumen_valoracion_titular || "Sin análisis específico.";
    const id = data.id || '';
    
    const badge = document.createElement('span');
    badge.className = `hemingwai-badge ${getBadgeClass(puntuacion)}`;
    badge.textContent = puntuacion;
    badge.title = "Click para ver detalles del análisis de HemingwAI";

    const popover = document.createElement('div');
    popover.className = 'hemingwai-popover';
    
    popover.innerHTML = `
        <h4>Análisis HemingwAI</h4>
        <div class="hemingwai-section">
            <span class="hemingwai-label">Puntuación Global</span>
            <span class="hemingwai-text" style="font-size: 1.2em; font-weight: bold; color: ${getBadgeColorHex(puntuacion)}">${puntuacion}/100</span>
        </div>
        <div class="hemingwai-section">
            <span class="hemingwai-label">Resumen</span>
            <div class="hemingwai-text">${resumen}</div>
        </div>
        <div class="hemingwai-section">
            <span class="hemingwai-label">Análisis del Titular</span>
            <div class="hemingwai-text">${resumenTitular}</div>
        </div>
        <div style="text-align: right; margin-top: 10px;">
             <a href="https://hemingwai-frontend-5vw6.onrender.com/analisis/${id}" target="_blank" class="hemingwai-link">Ver ficha completa &rarr;</a>
        </div>
    `;

    const wrapper = document.createElement('span');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-flex';
    wrapper.style.verticalAlign = 'middle';
    
    wrapper.appendChild(badge);
    wrapper.appendChild(popover);
    
    h1.appendChild(wrapper);

    badge.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const isVisible = popover.classList.contains('visible');
        document.querySelectorAll('.hemingwai-popover').forEach(p => p.classList.remove('visible'));
        if (!isVisible) {
            popover.classList.add('visible');
            const rect = popover.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                popover.style.left = 'auto';
                popover.style.right = '0';
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            popover.classList.remove('visible');
        }
    });
}

function renderListBadge(anchor, data) {
    if (anchor.dataset.hemingwai === "active") return;
    anchor.dataset.hemingwai = "active";
    
    const puntuacion = data.puntuacion !== undefined ? data.puntuacion : '?';
    const id = data.id || '';
    
    const badge = document.createElement('span');
    badge.className = `hemingwai-badge hemingwai-badge-small ${getBadgeClass(puntuacion)}`;
    badge.textContent = puntuacion;
    badge.title = `Puntuación HemingwAI: ${puntuacion}/100`;

    if (id) {
        const link = document.createElement('a');
        link.href = `https://hemingwai-frontend-5vw6.onrender.com/analisis/${id}`;
        link.target = "_blank";
        link.style.textDecoration = "none";
        link.style.display = "inline-flex";
        link.appendChild(badge);
        
        if (anchor.nextSibling) {
            anchor.parentNode.insertBefore(link, anchor.nextSibling);
        } else {
            anchor.parentNode.appendChild(link);
        }
    } else {
         if (anchor.nextSibling) {
            anchor.parentNode.insertBefore(badge, anchor.nextSibling);
        } else {
            anchor.parentNode.appendChild(badge);
        }
    }
}

// ========================================================
// LOGICA PRINCIPAL
// ========================================================

/**
 * Procesa la página actual como noticia, usando el endpoint BATCH para consistencia.
 */
async function processArticlePage() {
    console.log("HemingwAI: Artículo detectado. Consultando API (Batch)...");
    
    const currentUrl = window.location.href;
    const currentUrlNorm = normalizeUrl(currentUrl);

    try {
        // Usamos check-urls enviando un array de 1 elemento
        const response = await fetch(API_ENDPOINT_BATCH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: [currentUrl] })
        });

        if (!response.ok) {
            console.error("HemingwAI: Error en la respuesta del servidor", response.status);
            return;
        }

        const data = await response.json();
        const resultados = data.resultados || [];
        
        // Buscar el resultado que coincida con la URL actual
        const match = resultados.find(r => normalizeUrl(r.url) === currentUrlNorm);

        if (match && match.analizado && match.puntuacion !== undefined) {
            console.log("HemingwAI: Noticia analizada encontrada.", match);
            renderArticleUI(match);
        } else {
            console.log("HemingwAI: Noticia no analizada (batch).");
        }

    } catch (error) {
        console.error("HemingwAI: Error de conexión (Single/Batch)", error);
    }
}

/**
 * Escanea una página de listado/portada.
 */
async function scanListingPage() {
    console.log("HemingwAI: Escaneando listado/portada...");
    
    const anchors = Array.from(document.querySelectorAll('a'));
    const candidates = [];
    const urlToAnchorMap = new Map(); // Mapa NormUrl -> Array[Anchor]

    const currentOrigin = window.location.origin;

    for (const a of anchors) {
        if (candidates.length >= MAX_URLS_PER_PAGE) break;
        if (a.dataset.hemingwai === "active") continue;
        
        const href = a.href;
        if (!href) continue;

        try {
            const urlObj = new URL(href, currentOrigin);
            
            if (urlObj.origin !== currentOrigin) continue;
            if (urlObj.pathname === '/' || urlObj.pathname === '') continue;
            if (urlObj.hash) continue;
            if ((a.textContent || "").trim().length < 20) continue;
            
            const fullUrl = urlObj.href;
            const normUrl = normalizeUrl(fullUrl);

            // Evitar duplicados en candidates
            if (!candidates.includes(fullUrl)) {
                 candidates.push(fullUrl);
            }
            
            // Mapear por URL Normalizada
            if (!urlToAnchorMap.has(normUrl)) {
                urlToAnchorMap.set(normUrl, []);
            }
            urlToAnchorMap.get(normUrl).push(a);

        } catch (e) { }
    }

    if (candidates.length === 0) {
        console.log("HemingwAI: No se encontraron enlaces candidatos.");
        return;
    }

    // Enviamos las URLs originales (uniques)
    console.log(`HemingwAI: Consultando batch para ${candidates.length} URLs...`);

    try {
        const response = await fetch(API_ENDPOINT_BATCH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: candidates })
        });

        if (!response.ok) {
            console.error("HemingwAI: Error en batch request", response.status);
            return;
        }

        const data = await response.json();
        const resultados = data.resultados || [];

        let foundCount = 0;
        for (const res of resultados) {
            if (res.analizado) {
                // El backend devuelve 'url' normalizada (o tal cual la procesó python)
                const resUrlNorm = normalizeUrl(res.url);
                
                // Buscar en nuestro mapa
                if (urlToAnchorMap.has(resUrlNorm)) {
                    const anchorsToUpdate = urlToAnchorMap.get(resUrlNorm);
                    anchorsToUpdate.forEach(anchor => {
                        renderListBadge(anchor, res);
                        foundCount++;
                    });
                }
            }
        }
        console.log(`HemingwAI: Se pintaron badges en ${foundCount} elementos.`);

    } catch (error) {
        console.error("HemingwAI: Error batch fetch", error);
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
