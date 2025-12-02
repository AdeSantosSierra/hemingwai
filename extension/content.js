// HemingwAI Extension - Content Script
// Detecta noticias y muestra su valoración de calidad.

// Configuración
const API_BASE = "https://hemingwai-backend-5vw6.onrender.com";
const API_ENDPOINT_SINGLE = `${API_BASE}/api/check-url`;
const API_ENDPOINT_BATCH = `${API_BASE}/api/check-urls`;
// const API_BASE = "http://localhost:3000"; // Para desarrollo local

const MAX_URLS_PER_PAGE = 50;

/**
 * Detecta si la página actual es un artículo de noticias.
 * Utiliza heurísticas basadas en metadatos y estructura HTML.
 * @returns {boolean}
 */
function isNewsArticle() {
    // 1. Verificar Open Graph Type
    const ogType = document.querySelector('meta[property="og:type"]');
    if (ogType && ogType.content === 'article') return true;

    // 2. Verificar Schema.org NewsArticle
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
        if (script.textContent.includes('NewsArticle') || script.textContent.includes('ReportageNewsArticle')) {
            return true;
        }
    }

    // 3. Fallback: Presencia de etiqueta <article> y un <h1>
    const hasArticleTag = document.getElementsByTagName('article').length > 0;
    const hasH1 = document.getElementsByTagName('h1').length > 0;

    if (hasArticleTag && hasH1) return true;

    return false;
}

/**
 * Obtiene el color del badge basado en la puntuación.
 * @param {number} score - Puntuación de 0 a 100.
 * @returns {string} - Clase CSS correspondiente.
 */
function getBadgeClass(score) {
    if (score >= 70) return 'hemingwai-badge-high'; // Verde
    if (score >= 50) return 'hemingwai-badge-medium'; // Amarillo
    return 'hemingwai-badge-low'; // Rojo
}

/**
 * Helper para obtener el código hexadecimal del color (para uso inline si es necesario)
 */
function getBadgeColorHex(score) {
    if (score >= 70) return '#28a745';
    if (score >= 50) return '#ffc107';
    return '#dc3545';
}

/**
 * Renderiza la interfaz de usuario para una noticia individual (Badge + Popover).
 * @param {object} data - Datos devueltos por la API.
 */
function renderArticleUI(data) {
    const h1 = document.querySelector('h1');
    if (!h1 || h1.dataset.hemingwai) return; // Evitar duplicados

    h1.dataset.hemingwai = "active"; // Marcar como procesado
    
    // Extracción segura de datos con valores por defecto
    const puntuacion = data.puntuacion !== undefined ? data.puntuacion : '?';
    const resumen = data.resumen_valoracion || "Sin resumen disponible.";
    const resumenTitular = data.resumen_valoracion_titular || "Sin análisis específico.";
    const id = data.id || '';
    
    // 1. Crear el Badge (span inline-block)
    const badge = document.createElement('span');
    badge.className = `hemingwai-badge ${getBadgeClass(puntuacion)}`;
    badge.textContent = puntuacion;
    badge.title = "Click para ver detalles del análisis de HemingwAI";

    // 2. Crear el Popover (div block)
    const popover = document.createElement('div');
    popover.className = 'hemingwai-popover';
    
    // Contenido del Popover
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

    // 3. Insertar en el DOM
    const wrapper = document.createElement('span');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-flex';
    wrapper.style.verticalAlign = 'middle';
    
    wrapper.appendChild(badge);
    wrapper.appendChild(popover);
    
    h1.appendChild(wrapper);

    // 4. Lógica de Interacción (Toggle)
    badge.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        const isVisible = popover.classList.contains('visible');
        
        // Cerrar otros popovers
        document.querySelectorAll('.hemingwai-popover').forEach(p => p.classList.remove('visible'));

        if (!isVisible) {
            popover.classList.add('visible');
            // Ajustar posición si se sale de pantalla (básico)
            const rect = popover.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                popover.style.left = 'auto';
                popover.style.right = '0';
            }
        }
    });

    // Cerrar al hacer click fuera
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            popover.classList.remove('visible');
        }
    });
}

/**
 * Renderiza un badge pequeño para listados/portadas.
 * @param {HTMLElement} anchor - El elemento <a>.
 * @param {object} data - Datos de la noticia.
 */
function renderListBadge(anchor, data) {
    if (anchor.dataset.hemingwai === "active") return;
    
    anchor.dataset.hemingwai = "active";
    
    const puntuacion = data.puntuacion !== undefined ? data.puntuacion : '?';
    const id = data.id || '';
    
    const badge = document.createElement('span');
    badge.className = `hemingwai-badge hemingwai-badge-small ${getBadgeClass(puntuacion)}`;
    badge.textContent = puntuacion;
    badge.title = `Puntuación HemingwAI: ${puntuacion}/100`;

    // Envolver en enlace si hay ID
    if (id) {
        const link = document.createElement('a');
        link.href = `https://hemingwai-frontend-5vw6.onrender.com/analisis/${id}`;
        link.target = "_blank";
        link.style.textDecoration = "none";
        link.style.display = "inline-flex"; // Mantener alineación
        link.appendChild(badge);
        
        // Insertar después del anchor
        if (anchor.nextSibling) {
            anchor.parentNode.insertBefore(link, anchor.nextSibling);
        } else {
            anchor.parentNode.appendChild(link);
        }
    } else {
         // Insertar directamente si no hay ID (raro si está analizado)
         if (anchor.nextSibling) {
            anchor.parentNode.insertBefore(badge, anchor.nextSibling);
        } else {
            anchor.parentNode.appendChild(badge);
        }
    }
}


/**
 * Procesa la página actual como una noticia individual.
 */
async function processArticlePage() {
    console.log("HemingwAI: Artículo detectado. Consultando API...");

    try {
        const response = await fetch(API_ENDPOINT_SINGLE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: window.location.href })
        });

        if (!response.ok) {
            if (response.status === 404) {
                console.log("HemingwAI: Noticia no analizada todavía.");
            } else {
                console.error("HemingwAI: Error en la respuesta del servidor", response.status);
            }
            return;
        }

        const data = await response.json();

        if (data.analizado && data.puntuacion !== undefined) {
            renderArticleUI(data);
        }

    } catch (error) {
        console.error("HemingwAI: Error de conexión (Single)", error);
    }
}

/**
 * Escanea una página de listado/portada buscando enlaces a noticias.
 */
async function scanListingPage() {
    console.log("HemingwAI: Escaneando listado/portada...");
    
    const anchors = Array.from(document.querySelectorAll('a'));
    const candidates = [];
    const urlToAnchorMap = new Map(); // Mapa para renderizar después

    const currentOrigin = window.location.origin;

    for (const a of anchors) {
        // Filtrado básico
        if (candidates.length >= MAX_URLS_PER_PAGE) break;
        if (a.dataset.hemingwai === "active") continue;
        
        const href = a.href;
        if (!href) continue;

        try {
            const urlObj = new URL(href, currentOrigin);
            
            // Filtros
            if (urlObj.origin !== currentOrigin) continue; // Solo enlaces internos
            if (urlObj.pathname === '/' || urlObj.pathname === '') continue; // Ignorar home
            if (urlObj.hash) continue; // Ignorar anclas internas
            if ((a.textContent || "").trim().length < 20) continue; // Ignorar enlaces cortos (menús, etc)
            
            // Añadir a candidatos
            const fullUrl = urlObj.href;
            candidates.push(fullUrl);
            
            // Guardar referencia al anchor (puede haber múltiples anchors a la misma URL)
            if (!urlToAnchorMap.has(fullUrl)) {
                urlToAnchorMap.set(fullUrl, []);
            }
            urlToAnchorMap.get(fullUrl).push(a);

        } catch (e) {
            // Ignorar URLs inválidas
        }
    }

    if (candidates.length === 0) {
        console.log("HemingwAI: No se encontraron enlaces candidatos.");
        return;
    }

    // Eliminar duplicados en la lista de envío
    const uniqueUrls = [...new Set(candidates)];
    console.log(`HemingwAI: Consultando batch para ${uniqueUrls.length} URLs...`);

    try {
        const response = await fetch(API_ENDPOINT_BATCH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: uniqueUrls })
        });

        if (!response.ok) {
            console.error("HemingwAI: Error en batch request", response.status);
            return;
        }

        const data = await response.json();
        const resultados = data.resultados || [];

        // Procesar resultados
        let foundCount = 0;
        for (const res of resultados) {
            if (res.analizado) {
                foundCount++;
                // Buscar qué anchors apuntaban a esta URL (o equivalente)
                // Nota: El backend devuelve la URL normalizada en 'url' si queremos ser estrictos, 
                // pero aquí 'res.url' es lo que el backend procesó.
                // Como el backend normaliza, puede que la URL devuelta no coincida string-exacto con la enviada 
                // si tenía query params que nosotros no quitamos en el frontend (aunque intentamos no enviar cosas raras).
                
                // Estrategia robusta: El backend devuelve la 'url' que le enviamos (normalizada). 
                // Pero nuestro map usa la URL completa.
                // Deberíamos normalizar aquí también para hacer match, O confiar en que el backend devuelve la URL que matchea.
                
                // En nuestra implementación de python batch, devolvemos la 'norm_url'.
                // Así que necesitamos comparar normalizado con normalizado.
                
                const resUrlNorm = res.url; // Ya viene normalizada del backend

                // Iteramos nuestro mapa y normalizamos sus claves para ver si coinciden
                for (const [originalUrl, anchorList] of urlToAnchorMap.entries()) {
                     // Normalización simple frontend para comparar
                     let mapUrlNorm = originalUrl;
                     try {
                         const u = new URL(originalUrl);
                         mapUrlNorm = u.origin + u.pathname;
                     } catch(e) {}

                     // Comparación (el backend normaliza scheme+netloc+path)
                     if (mapUrlNorm === resUrlNorm) {
                         anchorList.forEach(anchor => renderListBadge(anchor, res));
                     }
                }
            }
        }
        console.log(`HemingwAI: Se encontraron ${foundCount} noticias analizadas.`);

    } catch (error) {
        console.error("HemingwAI: Error batch fetch", error);
    }
}


/**
 * Función principal de inicio.
 */
async function init() {
    if (isNewsArticle()) {
        await processArticlePage();
    } else {
        await scanListingPage();
    }
}

// Ejecutar al cargar (idle)
// Usar requestIdleCallback si está disponible para no bloquear carga inicial
if (window.requestIdleCallback) {
    window.requestIdleCallback(() => init());
} else {
    setTimeout(init, 1000);
}
