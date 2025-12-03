// Archivo principal del servidor Express.js
// Escucha peticiones del frontend y orquesta la ejecución de scripts de Python.

const express = require('express');
const { exec, spawn } = require('child_process');
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
// Configuración de CORS global explícita y permisiva
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests
app.options('*', cors());

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

// Contraseña maestra para el chatbot
const CHATBOT_PASSWORD = process.env.CHATBOT_PASSWORD;

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
 * POST /api/verify-password
 * Verifica si la contraseña proporcionada coincide con la variable de entorno.
 * body: { password: string }
 */
app.post('/api/verify-password', (req, res) => {
    const { password } = req.body;

    // Si no hay contraseña configurada en el servidor, se asume acceso libre (o se fuerza configuración).
    // Por seguridad y petición del usuario, si CHATBOT_PASSWORD existe, se debe validar.
    
    if (CHATBOT_PASSWORD) {
        if (password === CHATBOT_PASSWORD) {
            return res.json({ success: true });
        } else {
            return res.status(401).json({ success: false, error: "Contraseña incorrecta." });
        }
    } else {
        // Si no está definida la variable, avisamos en log pero permitimos (o bloqueamos).
        // Estrategia: Permitir acceso si no está configurada para no romper nada, pero idealmente debería configurarse.
        console.warn("ADVERTENCIA: CHATBOT_PASSWORD no está definida en el entorno. Acceso permitido por defecto.");
        return res.json({ success: true, warning: "Sin protección activada." });
    }
});

/**
 * POST /api/chatbot
 * Recibe una pregunta y un contexto sobre una noticia y devuelve la respuesta de un LLM.
 * body: { pregunta: string, contexto: { titulo: string, cuerpo: string, valoraciones: object }, password: string }
 */
app.post('/api/chatbot', async (req, res) => {
    const { pregunta, contexto, password } = req.body;

    // Verificación de seguridad
    if (CHATBOT_PASSWORD && password !== CHATBOT_PASSWORD) {
        return res.status(401).json({ error: "Acceso denegado. Contraseña incorrecta o ausente." });
    }

    if (!pregunta || !contexto || !contexto.titulo || !contexto.cuerpo || !contexto.valoraciones) {
        return res.status(400).json({ error: "La pregunta y un contexto completo (título, cuerpo, valoraciones) son requeridos." });
    }

    try {
        // 1. Construir el contexto extendido para la IA
        let contextoParaIA = `--- METADATOS ---\n`;
        contextoParaIA += `Título: "${contexto.titulo}"\n`;
        contextoParaIA += `Autor(es): "${contexto.autor || 'No especificado'}"\n`;
        contextoParaIA += `Fecha: "${contexto.fecha_publicacion || 'No especificada'}"\n`;
        contextoParaIA += `Fuente: "${contexto.fuente || 'No especificada'}"\n`;
        contextoParaIA += `URL: "${contexto.url || 'No especificada'}"\n\n`;

        contextoParaIA += `--- CUERPO DE LA NOTICIA ---\n"${contexto.cuerpo}"\n\n`;

        contextoParaIA += "--- ANÁLISIS DE CALIDAD (Valoraciones) ---\n";
        for (const key in contexto.valoraciones) {
            const nombreParametro = NOMBRES_PARAMETROS[key] || `Parámetro ${key}`;
            contextoParaIA += `- ${nombreParametro}: ${contexto.valoraciones[key]}\n`;
        }
        
        contextoParaIA += `\nPuntuación Global: ${contexto.puntuacion || 'N/A'}/100\n`;
        if (contexto.puntuacion_individual) {
             contextoParaIA += `Puntuaciones por sección: ${JSON.stringify(contexto.puntuacion_individual)}\n`;
        }

        if (contexto.fact_check_analisis) {
            contextoParaIA += `\n--- FACT-CHECKING (Verificación externa) ---\n`;
            contextoParaIA += `${contexto.fact_check_analisis}\n`;
            if (contexto.fact_check_fuentes && contexto.fact_check_fuentes.length > 0) {
                 contextoParaIA += `Fuentes de verificación: ${contexto.fact_check_fuentes.join(', ')}\n`;
            }
        }

        if (contexto.valoracion_titular) {
             contextoParaIA += `\n--- ANÁLISIS DEL TITULAR ---\n`;
             contextoParaIA += JSON.stringify(contexto.valoracion_titular, null, 2);
             contextoParaIA += "\n";
        }

        if (contexto.texto_referencia_diccionario) {
             contextoParaIA += `\n--- EVIDENCIAS TEXTUALES (Citas del texto que justifican el análisis) ---\n`;
             const evidencias = typeof contexto.texto_referencia_diccionario === 'string' 
                ? contexto.texto_referencia_diccionario 
                : JSON.stringify(contexto.texto_referencia_diccionario, null, 2);
             contextoParaIA += `${evidencias}\n`;
        }
        
        if (contexto.keywords) {
            contextoParaIA += `\nKeywords: ${Array.isArray(contexto.keywords) ? contexto.keywords.join(', ') : contexto.keywords}\n`;
        }

        // 2. Definir el prompt del sistema
        const systemPrompt = `
        Eres un asistente virtual experto en análisis de noticias.
        Tu función es ayudar al usuario a entender mejor el ANÁLISIS de una noticia concreta usando toda la información disponible en el contexto.
        
        Tienes acceso a los siguientes bloques de información:
        1. METADATOS: Autor, fecha, fuente, URL.
        2. CUERPO DE LA NOTICIA: El texto original.
        3. VALORACIONES (ANÁLISIS DE CALIDAD): Críticas sobre 10 criterios periodísticos (Ética, Fuentes, Contexto, etc.).
        4. EVIDENCIAS TEXTUALES (texto_referencia_diccionario): Citas exactas del texto que justifican las valoraciones. Úsalas para demostrar "por qué" se critica algo, citando la frase específica.
        5. FACT-CHECKING (fact_check_analisis): Una verificación realizada por una IA externa que contrasta los datos de la noticia con fuentes de internet. Úsalo para confirmar si la noticia dice la verdad o miente en sus datos/afirmaciones.
        6. ANÁLISIS DEL TITULAR (valoracion_titular): Evaluación específica sobre si el título es clickbait, sensacionalista o preciso.
        
        Estilo:
        - Sé claro, profesional y pedagógico.
        - Usa un tono respetuoso y colaborativo.
        - Cita partes del análisis para explicarte mejor cuando sea necesario.
        
        Instrucciones específicas:
        - Si te preguntan por la veracidad, básate en el apartado de FACT-CHECKING.
        - Si te preguntan por qué se le da cierta puntuación o crítica, busca en las EVIDENCIAS TEXTUALES la frase de la noticia que provocó esa crítica y cítala como ejemplo.
        - Si el usuario pide un resumen de alguna parte del análisis (ej: "resumen del fact-check" o "resumen del análisis del titular"), hazlo sin problemas.
        - Puedes mencionar la puntuación individual de cada sección si es relevante.
        
        Restricciones generales:
        - Basa tus respuestas únicamente en el contexto proporcionado.
        - NO inventes datos ni hechos nuevos.
        - Si el texto no contiene la respuesta, dilo amablemente.
        - No reproduzcas el cuerpo completo de la noticia por copyright, pero puedes citar fragmentos breves (2-3 frases) para verificar información o dar ejemplos.
        
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
 * POST /api/check-url
 * Endpoint ligero para que la extensión del navegador compruebe si una URL ya ha sido analizada.
 * body: { url: string }
 */
app.post('/api/check-url', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: "El campo 'url' es requerido." });
    }

    try {
        // Reutilizamos la misma lógica que en /api/buscar,
        // pero pasando directamente la URL como identificador.
        const args = [url];
        const resultado = await ejecutarScriptPython('buscar_noticia.py', args);

        // El propio script devuelve un mensaje estándar cuando no encuentra nada
        if (!resultado || resultado.mensaje === "Noticia no encontrada.") {
            return res.status(404).json({ analizado: false });
        }

        // Intentamos mapear posibles nombres de campos de puntuación y resúmenes
        const id = resultado._id || resultado.id || null;
        const puntuacion =
            resultado.puntuacion ??
            resultado.puntuacion_global ??
            resultado.puntuacionTotal ??
            null;

        const resumen_valoracion =
            resultado.resumen_valoracion ||
            resultado.resumen_global ||
            null;

        const resumen_valoracion_titular =
            resultado.resumen_valoracion_titular ||
            (resultado.valoracion_titular && resultado.valoracion_titular.resumen) ||
            null;

        return res.json({
            analizado: true,
            id,
            puntuacion,
            resumen_valoracion,
            resumen_valoracion_titular
        });
    } catch (error) {
        console.error('Error en /api/check-url:', error);
        return res.status(500).json({
            error: error.error || "Error interno del servidor al ejecutar script de búsqueda."
        });
    }
});

/**
 * POST /api/check-urls
 * Endpoint batch para verificar múltiples URLs a la vez usando spawn.
 * body: { urls: string[] }
 */
app.post('/api/check-urls', (req, res) => {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({ ok: false, error: "El campo 'urls' debe ser una lista." });
    }

    if (urls.length === 0) {
        return res.json({ ok: true, resultados: [] });
    }

    // Limitar el número de URLs para evitar abusos
    const MAX_URLS = 50;
    if (urls.length > MAX_URLS) {
        return res.status(400).json({ ok: false, error: `No se pueden procesar más de ${MAX_URLS} URLs por petición.` });
    }

    const scriptName = 'buscar_noticias_batch.py';
    const scriptPath = path.join(PYTHON_SCRIPT_DIR, scriptName);
    
    // Configuración del spawn
    const py = spawn(PYTHON_INTERPRETER, [scriptPath]);
    
    let stdoutData = '';
    let stderrData = '';
    
    // Timeout de 30 segundos
    const TIMEOUT_MS = 30000;
    const timeout = setTimeout(() => {
        console.error(`[/api/check-urls] Timeout (${TIMEOUT_MS}ms). Matando proceso.`);
        py.kill();
        if (!res.headersSent) {
            res.status(504).json({
                ok: false,
                error: 'Timeout in /api/check-urls Python process',
            });
        }
    }, TIMEOUT_MS);

    // Captura de streams
    py.stdout.on('data', (data) => {
        const str = data.toString();
        // console.log("[/api/check-urls] py stdout (chunk):", str.length);
        stdoutData += str;
    });

    py.stderr.on('data', (data) => {
        const str = data.toString();
        console.error("[/api/check-urls] py stderr:", str);
        stderrData += str;
    });

    py.on('error', (err) => {
        clearTimeout(timeout);
        console.error("[/api/check-urls] Error al iniciar proceso spawn:", err);
        if (!res.headersSent) {
            res.status(500).json({ 
                ok: false, 
                error: 'Error interno al iniciar script de Python',
                details: err.message 
            });
        }
    });

    py.on('close', (code) => {
        clearTimeout(timeout);
        
        // Si la respuesta ya se envió (por timeout), no hacemos nada
        if (res.headersSent) return;

        if (code !== 0) {
            console.error(`[/api/check-urls] Proceso terminó con código ${code}`);
            
            // Intentar parsear stdout/stderr por si el script imprimió JSON de error antes de morir
            try {
                const jsonError = JSON.parse(stdoutData || stderrData);
                return res.status(500).json({
                    ok: false,
                    error: jsonError.error || 'Error en script Python',
                    details: jsonError.details || null,
                    pythonError: stderrData // Opcional, para debug
                });
            } catch (e) {
                return res.status(500).json({
                    ok: false,
                    error: `Error interno en /api/check-urls (exit code ${code})`,
                    details: stderrData || 'No stderr details'
                });
            }
        }

        // Si el código es 0, intentamos parsear el JSON exitoso
        try {
            const resultado = JSON.parse(stdoutData);
            
            // Verificamos si el propio JSON dice ok: false (aunque exit code sea 0, por seguridad)
            if (resultado.ok === false) {
                 return res.status(500).json(resultado);
            }
            
            return res.json(resultado);
        } catch (e) {
            console.error(`[/api/check-urls] Error al parsear JSON: ${e.message}. Salida raw: ${stdoutData.substring(0, 200)}...`);
            return res.status(500).json({
                ok: false,
                error: 'Respuesta inválida del procesador de datos.',
                details: 'El script Python no devolvió un JSON válido.'
            });
        }
    });

    // Enviar datos por stdin
    try {
        py.stdin.write(JSON.stringify({ urls }));
        py.stdin.end();
    } catch (stdinErr) {
        clearTimeout(timeout);
        console.error("[/api/check-urls] Error escribiendo en stdin:", stdinErr);
        if (!res.headersSent) {
            res.status(500).json({ ok: false, error: "Error de comunicación con script Python" });
        }
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
