// HemingwAI Extension - Content Script
// Detecta noticias y muestra su valoración de calidad.

// Configuración
//const API_ENDPOINT = "https://hemingwai.onrender.com/api/check-url";
const API_ENDPOINT = "http://localhost:3000/api/check-url";

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
 * Renderiza la interfaz de usuario (Badge + Popover).
 * @param {object} data - Datos devueltos por la API.
 */
function renderUI(data) {
    const h1 = document.querySelector('h1');
    if (!h1 || h1.dataset.hemingwai) return; // Evitar duplicados

    h1.dataset.hemingwai = "active"; // Marcar como procesado
    
    // Necesitamos un contenedor para posicionar el badge y el popover juntos
    // Opción: Insertar el badge dentro del H1, y el popover RELATIVO al badge.
    
    // 1. Crear el Badge (span inline-block)
    const badge = document.createElement('span');
    badge.className = `hemingwai-badge ${getBadgeClass(data.puntuacion)}`;
    badge.textContent = data.puntuacion;
    badge.title = "Click para ver detalles del análisis de HemingwAI";

    // 2. Crear el Popover (div block)
    const popover = document.createElement('div');
    popover.className = 'hemingwai-popover';
    
    // Contenido del Popover
    popover.innerHTML = `
        <h4>Análisis HemingwAI</h4>
        
        <div class="hemingwai-section">
            <span class="hemingwai-label">Puntuación Global</span>
            <span class="hemingwai-text" style="font-size: 1.2em; font-weight: bold; color: ${getBadgeColorHex(data.puntuacion)}">${data.puntuacion}/100</span>
        </div>

        <div class="hemingwai-section">
            <span class="hemingwai-label">Resumen</span>
            <div class="hemingwai-text">${data.resumen_valoracion || "Sin resumen disponible."}</div>
        </div>

        <div class="hemingwai-section">
            <span class="hemingwai-label">Análisis del Titular</span>
            <div class="hemingwai-text">${data.resumen_valoracion_titular || "Sin análisis específico."}</div>
        </div>
        
        <div style="text-align: right; margin-top: 10px;">
             <a href="https://hemingwai-frontend-5vw6.onrender.com/analisis/${data.id || ''}" target="_blank" class="hemingwai-link">Ver ficha completa &rarr;</a>
        </div>
    `;

    // 3. Insertar en el DOM
    // Estrategia segura: Badge dentro del H1. Popover como hermano del Badge para evitar anidamiento inválido (div dentro de span),
    // pero necesitamos que el popover se posicione respecto al badge.
    
    // Solución: Crear un wrapper inline-flex dentro del H1 que contenga ambos, 
    // o simplemente insertar ambos en el H1 y usar posicionamiento relativo en el wrapper.
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
 * Función principal de inicio.
 */
async function init() {
    // 1. Verificar si es noticia
    if (!isNewsArticle()) {
        console.log("HemingwAI: No se detectó un artículo de noticias.");
        return;
    }

    console.log("HemingwAI: Artículo detectado. Consultando API...");

    try {
        // 2. Consultar API
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: window.location.href
            })
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

        // 3. Renderizar si está analizado
        if (data.analizado && data.puntuacion !== undefined) {
            renderUI(data);
        }

    } catch (error) {
        console.error("HemingwAI: Error de conexión", error);
    }
}

// Ejecutar al cargar (idle)
init();
