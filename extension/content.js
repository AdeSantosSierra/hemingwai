// Función para generar un color aleatorio entre rojo, amarillo y verde
function getColorForNumber(num) {
    const red = Math.min(255, Math.floor((1 - num / 90) * 255)); // Rojo disminuye con el número
    const green = Math.min(255, Math.floor((num / 90) * 255)); // Verde aumenta con el número
    return `rgb(${red}, ${green}, 0)`; // Color entre rojo y verde
}

// Función para subrayar palabras aleatorias en el titular
function underlineRandomWords(headlineText) {
    const words = headlineText.split(" ");
    const numWordsToUnderline = Math.floor(Math.random() * (words.length / 2)); // Número aleatorio de palabras a subrayar
    const underlinedWords = new Set();

    while (underlinedWords.size < numWordsToUnderline) {
        const randomIndex = Math.floor(Math.random() * words.length);
        underlinedWords.add(randomIndex);
    }

    return words.map((word, index) => {
        if (underlinedWords.has(index)) {
            return `<span style="background-color: rgba(255, 255, 0, 0.4);">${word}</span>`;
        }
        return word;
    }).join(" ");
}

function underlineGivenWords() {

    document.querySelectorAll("p").forEach(async cuerpo => { 
        if (!cuerpo.dataset.modified) { // Evita duplicados
            // Subrayar palabras aleatorias en el titular
            const originalText = cuerpo.textContent;
            const updatedText = underlineRandomWords(originalText);
            cuerpo.innerHTML = updatedText; // Reemplaza el contenido HTML con las palabras subrayadas

            const response = await fetch(`https://hemingwai.onrender.com/url?url=${url}`);

            const data = await response.json();

            console.log(data.texto_referencia_diccionario)

    
            const regex = new RegExp(`(${escapeRegExp(textoParaSubrayar)})`, 'gi');

        }
    });


    

    return headlineText.replace(regex, '<span style="background-color: rgba(255, 255, 0, 0.4);">$1</span>');
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


async function getScoreForArticle(url) {
    try {
        // Haces la solicitud al backend, pasando el Id_noticia como parámetro
        const response = await fetch(`https://hemingwai.onrender.com/url?url=${url}`);

        console.log('window.location.href')
        console.log(window.location.href)
        console.log('url')
        console.log(url)

        const data = await response.json();
        
        // Retornamos el valor del puntuacion
        console.log('data')
        console.log(data)
        console.log(data.puntuacion)
        console.log(data.texto_referencia_diccionario)
        
        return data.puntuacion;
    } catch (error) {
        console.error('Error al obtener el puntuacion:', error);
        return null; // Si hay error, devolvemos null
    }
}

async function getValoracionForArticle(url) {
    try {
        // Haces la solicitud al backend, pasando el Id_noticia como parámetro
        const response = await fetch(`https://hemingwai.onrender.com/url?url=${url}`);

        const data = await response.json();
        
        // Retornamos el valor del puntuacion
        console.log('data')
        console.log(data)
        console.log('data.valoraciones_html')
        console.log(data.valoraciones_html)
        console.log(data.valoraciones_html[1])
        
        return data.valoraciones_html[1];
    } catch (error) {
        console.error('Error al obtener la valoración:', error);
        return null; // Si hay error, devolvemos null
    }
}



// Función para agregar números aleatorios a los titulares
async function addRandomNumbersToHeadlines() {
    document.querySelectorAll("h1, h2, h3").forEach(async headline => { 
        if (!headline.dataset.modified) { // Evita duplicados
            // Subrayar palabras aleatorias en el titular
            const originalText = headline.textContent;
            const updatedText = underlineRandomWords(originalText);
            headline.innerHTML = updatedText; // Reemplaza el contenido HTML con las palabras subrayadas

            console.log(window.location.href); 

            const url = window.location.href;  // Aquí deberías obtener el url real de tu artículo (puedes hacerlo dinámicamente)
            const score_noticia = await getScoreForArticle(url);  // Llamada a la API para obtener el score_noticia

            let circle = document.createElement("span");

            // Asignamos el color aleatorio basado en el score_noticia (si existe)
            circle.textContent = score_noticia !== null ? score_noticia : 5;  // Si score_noticia es null, mostrar 'Cargando...'
            circle.style.cssText = `
                display: inline-flex;
                justify-content: center;
                align-items: center;
                margin-left: 10px;
                width: 24px;
                height: 24px;
                background-color: ${getColorForNumber(score_noticia)}; // Color según el score_noticia
                color: white;
                font-size: 14px;
                font-weight: bold;
                text-align: center;
                border-radius: 50%;
                cursor: pointer;
                position: absolute;
                left: -30px;
                top: 50%;
                transform: translateY(-50%);
            `;

            headline.appendChild(circle);
            headline.dataset.modified = "true";

            // Crear el modal más sencillo
            let modal = document.createElement("div");

            const valoracion = await getValoracionForArticle(url);

            modal.innerHTML = valoracion !== null ? valoracion : "Lorem ipsum dolor sit amet."; // Texto simple

            modal.style.cssText = `
                display: none;
                position: absolute;
                background: white;
                color: black;
                padding: 10px 15px;
                border-radius: 5px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                font-size: 10px; /* Aumenté el tamaño de la fuente */
                font-family: Arial, sans-serif; /* Se puede cambiar la fuente */
                line-height: 1.5; /* Mejorar la legibilidad del texto */
                min-width: 500px; /* Hice el modal 3 veces más ancho */
                min-height: 50px; /* Aumenté la altura mínima para dar más espacio al texto */
                z-index: 100000;
                pointer-events: none;
                left: 50%;
                transform: translateX(-50%);
            `;


            circle.appendChild(modal);

            // Mostrar el modal cuando el ratón entre en el círculo
            circle.addEventListener("mouseenter", (event) => {
                modal.style.display = "block";
                modal.style.top = `-35px`;
            });

            // Mover el modal con el ratón
            circle.addEventListener("mousemove", (event) => {
                modal.style.top = `-35px`;
            });

            // Ocultar el modal cuando el ratón salga del círculo
            circle.addEventListener("mouseleave", () => {
                modal.style.display = "none";
            });
        }
    });
}


// Ejecuta la función al cargar la página
addRandomNumbersToHeadlines();
