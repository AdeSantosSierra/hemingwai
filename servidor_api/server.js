// Archivo principal del servidor Express.js
// Escucha peticiones del frontend y orquesta la ejecución de scripts de Python.

const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const path = require('path');
const OpenAI = require('openai');

// Cargar variables de entorno desde el archivo .env en el root del proyecto
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();

// IMPORTANTE: Usar variable de entorno PORT para Render
const PORT = process.env.PORT || 3000;

const PYTHON_SCRIPT_DIR = path.join(__dirname, '..', 'src');

// El intérprete de Python se resuelve automáticamente desde el PATH del entorno virtual definido en el Dockerfile.
const PYTHON_INTERPRETER = 'python'; 

// Middleware
// Configuración de CORS para permitir explícitamente el origen del frontend en Render y localhost para desarrollo
const allowedOrigins = [
    'https://hemingwai-frontend-5vw6.onrender.com', // Origen de producción
    'http://localhost:5173',                        // Origen local común para Vite
    'http://localhost:5174',                        // Origen local alternativo para Vite
    'http://localhost:5175'                         // Origen local alternativo para Vite
];

const corsOptions = {
    origin: (origin, callback) => {
        // Permitir peticiones sin origen (ej. Postman) o si el origen está en la lista blanca
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('No permitido por CORS'));
        }
    },
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions)); // Aplica la configuración de CORS
app.use(express.json()); // Para parsear cuerpos de petición JSON

// Ruta de health check para Render
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok',
        message: 'API Hemingwai funcionando correctamente',
        timestamp: new Date().toISOString()
    });
});

// Ruta adicional de health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        python: PYTHON_INTERPRETER,
        scriptDir: PYTHON_SCRIPT_DIR
    });
});

/**
 * Función que ejecuta un script de Python con argumentos.
 * @param {string} scriptName - Nombre del script (e.g., 'buscar_noticia.py').
 * @param {string[]} args - Argumentos a pasar al script.
 * @returns {Promise<object>} Objeto JSON con el resultado del script o un error.
 */
function ejecutarScriptPython(scriptName, args = []) {
    const scriptPath = path.join(PYTHON_SCRIPT_DIR, scriptName);
    // El comando usa la ruta ABSOLUTA definida arriba
    const command = `${PYTHON_INTERPRETER} ${scriptPath} ${args.join(' ')}`;

    console.log(`Ejecutando: ${command}`);

    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                // El script falló o el intérprete no se encontró.
                console.error(`Error al ejecutar el script ${scriptName}: ${stderr}`);
                
                // Intentamos parsear stderr si es JSON (como devuelven los scripts)
                try {
                    const errorJson = JSON.parse(stderr);
                    return reject({ error: errorJson.error || `Error desconocido: ${stderr}` });
                } catch (e) {
                    return reject({ error: `Error de ejecución: ${error.message}` });
                }
            }
            
            if (stderr) {
                console.warn(`Salida de advertencia/error de Python (stderr): ${stderr}`);
            }

            // El output del script de Python siempre debe ser JSON
            try {
                const resultado = JSON.parse(stdout);
                resolve(resultado);
            } catch (e) {
                console.error(`Error al parsear el JSON de salida de ${scriptName}: ${stdout}`);
                reject({ error: `Formato de salida inválido del script: ${e.message}` });
            }
        });
    });
}

// =======================================================
// CONFIGURACIÓN DE OPENAI
// =======================================================

// Asegurarse de que la API key está disponible
if (!process.env.OPENAI_API_KEY) {
    console.error("Error fatal: La variable de entorno OPENAI_API_KEY no está definida.");
    // En un entorno de producción, sería mejor salir del proceso si la configuración crítica falta.
    // process.exit(1); 
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Nombres de los parámetros de evaluación para dar contexto al modelo
const NOMBRES_PARAMETROS = {
    1: "Interpretación del periodista",
    2: "Opiniones",
    3: "Cita de fuentes",
    4: "Confiabilidad de las fuentes",
    5: "Trascendencia",
    6: "Relevancia de los datos",
    7: "Precisión y claridad",
    8: "Enfoque",
    9: "Contexto",
    10: "Ética",
};

// =======================================================
// RUTAS DE LA API
// =======================================================

/**
 * POST /api/chatbot
 * Recibe una pregunta y un contexto sobre una noticia y devuelve la respuesta de un LLM.
 * body: { pregunta: string, contexto: { titulo: string, cuerpo: string, valoraciones: object } }
 */
app.post('/api/chatbot', async (req, res) => {
    const { pregunta, contexto } = req.body;

    if (!pregunta || !contexto || !contexto.titulo || !contexto.cuerpo || !contexto.valoraciones) {
        return res.status(400).json({ error: "La pregunta y un contexto completo (título, cuerpo, valoraciones) son requeridos." });
    }

    try {
        // 1. Construir el contexto para la IA
        let contextoParaIA = `Título de la noticia: "${contexto.titulo}"\n\n`;
        contextoParaIA += `Cuerpo de la noticia: "${contexto.cuerpo}"\n\n`;
        contextoParaIA += "Análisis de la noticia:\n";
        
        for (const key in contexto.valoraciones) {
            const nombreParametro = NOMBRES_PARAMETROS[key] || `Parámetro ${key}`;
            contextoParaIA += `- ${nombreParametro}: ${contexto.valoraciones[key]}\n`;
        }

        // 2. Definir el prompt del sistema
        const systemPrompt = `
        Eres un asistente virtual experto en análisis de noticias.
        Tu función es ayudar al usuario a entender mejor el ANÁLISIS de una noticia concreta usando el título, el cuerpo y las valoraciones que se te proporcionan.
        
        Estilo:
        - Sé claro, profesional y pedagógico.
        - Usa un tono respetuoso y colaborativo, sin emoticonos ni coloquialismos excesivos.
        - Evita dar respuestas excesivamente generales: céntrate en lo que dice ESTE análisis concreto.
        
        Contenido:
        - Basa tus respuestas únicamente en el contexto proporcionado (título, cuerpo y valoraciones).
        - NO inventes datos ni hechos nuevos.
        - Cuando el usuario pregunte por un parámetro concreto (por ejemplo: ética, rigor, calidad de las fuentes, contexto, etc.):
            - Localiza las partes relevantes dentro de las valoraciones.
            - Resume y parafrasea esa información con tus propias palabras.
            - Organiza la respuesta en 2-3 ideas clave y, si es útil, añade 1-3 recomendaciones prácticas.
        
        Uso de las valoraciones:
        - Evita copiar literalmente párrafos largos del campo "valoraciones".
        - NO reproduzcas más de dos frases seguidas de forma literal. En lugar de eso, reescribe el contenido y organiza la información de forma más clara.
        - Solo puedes citar literalmente frases cortas como ejemplo concreto cuando el usuario lo pida explícitamente.
        
        Uso del cuerpo de la noticia:
        - Puedes resumir y parafrasear el contenido del cuerpo de la noticia para apoyar tus explicaciones.
        - No reproduzcas el cuerpo completo ni grandes fragmentos de forma literal.
        
        Si el usuario te pide:
        - El cuerpo completo de la noticia, o que copies literalmente grandes partes del texto (por ejemplo "dame el cuerpo completo", "copia las primeras frases exactamente"):
            → responde:
            "No puedo reproducir literalmente el texto de la noticia, pero puedo resumirlo o describir cómo empieza si lo deseas."
        
        - Palabras o frases concretas como ejemplos (por ejemplo: "¿qué expresión concreta se usa para describir X?"):
            → puedes citar fragmentos breves del texto o de las valoraciones, siempre que no sean grandes bloques.
        
        - Algo que no puede deducirse del análisis ni del texto disponible:
            → responde de forma amable, por ejemplo:
            "Con los datos de este análisis no puedo responder con seguridad a esa pregunta. Haría falta información adicional."
        
        Responde siempre en español.
        `;
        




        // 3. Llamar a la API de OpenAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: `Aquí está el contexto de la noticia:\n\n${contextoParaIA}\n\nMi pregunta es: ${pregunta}`
                }
            ],
            temperature: 0, // Para respuestas más deterministas y objetivas
            max_tokens: 4096,
        });

        const respuesta = completion.choices[0]?.message?.content?.trim();

        if (respuesta) {
            res.json({ respuesta });
        } else {
            res.status(500).json({ error: "No se pudo obtener una respuesta del servicio de IA." });
        }

    } catch (error) {
        console.error("Error al llamar a la API de OpenAI:", error);
        res.status(500).json({ error: "No he podido procesar tu pregunta, por favor inténtalo de nuevo." });
    }
});

/**
 * POST /api/buscar
 * Busca una noticia por URL o ID en las BD (Nueva -> Antigua).
 * body: { identificador: 'url_o_id', soloAntigua: false }
 */
app.post('/api/buscar', async (req, res) => {
    const { identificador, soloAntigua } = req.body;

    if (!identificador) {
        return res.status(400).json({ error: "El campo 'identificador' es requerido." });
    }

    const args = [identificador];
    if (soloAntigua) {
        args.push('--solo-antigua');
    }

    try {
        const resultado = await ejecutarScriptPython('buscar_noticia.py', args);
        
        if (resultado.mensaje === "Noticia no encontrada.") {
             return res.status(404).json(resultado);
        }
        
        // Devuelve el objeto de la noticia encontrada (sin el embedding)
        res.json(resultado); 

    } catch (error) {
        console.error('Error en /api/buscar:', error);
        // Devuelve el error de ejecución de Python
        res.status(500).json({ error: error.error || "Error interno del servidor al ejecutar script de búsqueda." });
    }
});

// Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

// Inicio del servidor
// CRÍTICO: Escuchar en 0.0.0.0 para que Render pueda acceder
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ API escuchando en puerto ${PORT}...`);
    console.log(`🐍 Ruta de intérprete Python: ${PYTHON_INTERPRETER}`);
    console.log(`📁 Directorio de scripts: ${PYTHON_SCRIPT_DIR}`);
    console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
});