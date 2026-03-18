// Archivo principal del servidor Express.js
// Escucha peticiones del frontend y orquesta la ejecución de scripts de Python.

const express = require('express');
const { exec, spawn } = require('child_process');
const cors = require('cors');
const path = require('path');
const OpenAI = require('openai');
const { clerkMiddleware, requireAuth } = require('@clerk/express');

// Cargar variables de entorno desde el archivo .env en el root del proyecto
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();

// IMPORTANTE: Usar variable de entorno PORT para Render
const PORT = process.env.PORT || 3000;

const PYTHON_SCRIPT_DIR = path.join(__dirname, '..', 'src');
const HISTORY_SCRIPT = 'history_entrypoint.py';
const PERMISSIONS_SCRIPT = 'permissions_entrypoint.py';
const HISTORY_LIMIT = 4;

// El intérprete de Python se resuelve automáticamente desde el PATH del entorno virtual definido en el Dockerfile.
const PYTHON_INTERPRETER = 'python'; 

function normalizeOrigin(origin = '') {
    return String(origin).trim().replace(/\/+$/, '');
}

const LOCAL_DEV_ORIGINS = process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

const CHROME_EXTENSION_ORIGINS = [
    'chrome-extension://lmfnndfgfmikgmemeggdngamfdbiifnp'
];

const ALLOWED_ORIGINS = Array.from(new Set([
    process.env.FRONTEND_ORIGIN,
    ...(process.env.FRONTEND_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ...CHROME_EXTENSION_ORIGINS,
    ...LOCAL_DEV_ORIGINS,
].map(normalizeOrigin).filter(Boolean)));

const corsOptions = {
    origin(origin, callback) {
        // Permitir herramientas sin origin (curl/postman/server-to-server)
        if (!origin) {
            return callback(null, true);
        }

        if (ALLOWED_ORIGINS.includes(normalizeOrigin(origin))) {
            return callback(null, true);
        }

        const corsError = new Error('Not allowed by CORS');
        corsError.code = 'CORS_ORIGIN_DENIED';
        corsError.status = 403;
        corsError.origin = normalizeOrigin(origin);
        return callback(corsError);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
};

// Middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(clerkMiddleware());
app.use(express.json()); // Para parsear cuerpos de petición JSON

if (!process.env.CLERK_SECRET_KEY) {
    console.warn('ADVERTENCIA: CLERK_SECRET_KEY no está definida. requireAuth() rechazará solicitudes autenticadas.');
}

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

app.get('/api/me', requireAuth(), (req, res) => {
    const sessionClaims = req.auth?.sessionClaims || {};

    res.json({
        userId: req.auth?.userId || null,
        sessionId: req.auth?.sessionId || null,
        orgId: req.auth?.orgId || sessionClaims.org_id || null,
        issuedAt: Number.isFinite(sessionClaims.iat) ? sessionClaims.iat : null,
        exp: Number.isFinite(sessionClaims.exp) ? sessionClaims.exp : null,
    });
});

app.get('/api/chatbot/access', requireAuth(), async (req, res) => {
    const permission = await resolveChatbotPermissionState(req);
    if (!permission.ok) {
        return res.status(permission.status).json(permission.payload);
    }

    return res.json({
        ok: true,
        userId: permission.userId,
        canUseChatbot: permission.canUseChatbot,
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

function ejecutarScriptPythonPorStdin(scriptName, payload, timeoutMs = 10000) {
    const scriptPath = path.join(PYTHON_SCRIPT_DIR, scriptName);
    const py = spawn(PYTHON_INTERPRETER, [scriptPath]);

    return new Promise((resolve, reject) => {
        let stdoutData = '';
        let stderrData = '';

        const timeout = setTimeout(() => {
            py.kill();
            reject({ error: `Timeout ejecutando ${scriptName}` });
        }, timeoutMs);

        py.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        py.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        py.on('error', (err) => {
            clearTimeout(timeout);
            reject({ error: `Error al iniciar ${scriptName}`, details: err.message });
        });

        py.on('close', (code) => {
            clearTimeout(timeout);

            if (code !== 0) {
                try {
                    const parsedError = JSON.parse(stdoutData || stderrData);
                    return reject({
                        error: parsedError.error || `Error en ${scriptName}`,
                        details: parsedError.details || null,
                    });
                } catch (_e) {
                    return reject({
                        error: `Error en ${scriptName} (exit code ${code})`,
                        details: stderrData || stdoutData || null,
                    });
                }
            }

            try {
                const parsed = JSON.parse(stdoutData);
                if (parsed && parsed.ok === false) {
                    return reject({ error: parsed.error || `Error en ${scriptName}` });
                }
                resolve(parsed);
            } catch (err) {
                reject({
                    error: `Formato de salida inválido en ${scriptName}`,
                    details: err.message,
                });
            }
        });

        try {
            py.stdin.write(JSON.stringify(payload));
            py.stdin.end();
        } catch (stdinErr) {
            clearTimeout(timeout);
            py.kill();
            reject({
                error: `Error enviando datos a ${scriptName}`,
                details: stdinErr.message,
            });
        }
    });
}

function normalizeHistoryQuery(query) {
    if (typeof query !== 'string') {
        return '';
    }
    return query.trim();
}

function normalizeNullableHistoryText(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

async function pushHistoryForUser(userId, item) {
    const query = normalizeHistoryQuery(item?.query);
    if (!userId || !query) {
        return [];
    }

    const payload = {
        action: 'push_history',
        userId,
        limit: HISTORY_LIMIT,
        item: {
            query,
            title: normalizeNullableHistoryText(item?.title),
            url: normalizeNullableHistoryText(item?.url),
            timestamp: Date.now(),
        },
    };

    const result = await ejecutarScriptPythonPorStdin(HISTORY_SCRIPT, payload);
    return Array.isArray(result?.items) ? result.items : [];
}

function resolveSessionEmail(req) {
    const sessionClaims = req.auth?.sessionClaims || {};
    const candidateEmail =
        sessionClaims.email ||
        sessionClaims.email_address ||
        sessionClaims.primary_email_address?.email_address ||
        sessionClaims.primary_email_address?.email ||
        null;
    return normalizeNullableHistoryText(candidateEmail);
}

async function resolveChatbotPermissionState(req, { enforce = false } = {}) {
    const userId = req.auth?.userId;
    if (!userId) {
        return {
            ok: false,
            status: 401,
            payload: { ok: false, error: 'No autenticado.' },
        };
    }

    try {
        const result = await ejecutarScriptPythonPorStdin(PERMISSIONS_SCRIPT, {
            action: 'check_chatbot_access',
            userId,
            email: resolveSessionEmail(req),
            bootstrapIfMissing: true,
        });

        const canUseChatbot = result?.canUseChatbot === true;
        if (enforce && !canUseChatbot) {
            return {
                ok: false,
                status: 403,
                payload: {
                    ok: false,
                    error: 'chatbot_access_denied',
                    message: 'Tu usuario no tiene permiso para usar el chatbot.',
                },
            };
        }

        return {
            ok: true,
            userId,
            canUseChatbot,
        };
    } catch (error) {
        return {
            ok: false,
            status: 500,
            payload: {
                ok: false,
                error: 'permission_check_failed',
                message: error.error || 'No se pudo verificar el permiso de chatbot.',
            },
        };
    }
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
// Actualizados a los 5 criterios vigentes en Utils.criterios
const NOMBRES_PARAMETROS = {
    1: "Fiabilidad",
    2: "Adecuación",
    3: "Claridad",
    4: "Profundidad",
    5: "Enfoque",
};

function toFiniteNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function resolveGlobalScores(payload = {}) {
    const evaluation = payload.evaluation_result || {};
    const extras = evaluation.extras || {};
    const derived = evaluation.derived || {};

    const raw =
        toFiniteNumber(payload.global_score_raw) ??
        toFiniteNumber(extras.raw_global_score) ??
        toFiniteNumber(extras.global_score_raw) ??
        toFiniteNumber(derived.global_score_raw);

    let score2dp =
        toFiniteNumber(payload.global_score_2dp) ??
        toFiniteNumber(extras.global_score_2dp) ??
        toFiniteNumber(derived.global_score_2dp);

    if (score2dp === null && raw !== null) {
        score2dp = Math.round((raw + Number.EPSILON) * 100) / 100;
    }
    if (score2dp === null) {
        score2dp =
            toFiniteNumber(derived.global_score) ??
            toFiniteNumber(payload.puntuacion) ??
            toFiniteNumber(payload.puntuacion_global) ??
            toFiniteNumber(payload.puntuacionTotal);
    }

    const score1dp =
        toFiniteNumber(payload.global_score_1dp) ??
        toFiniteNumber(extras.global_score_1dp) ??
        toFiniteNumber(derived.global_score_1dp) ??
        (score2dp === null ? null : Math.round((score2dp + Number.EPSILON) * 10) / 10);

    return {
        global_score_raw: raw,
        global_score_2dp: score2dp,
        global_score_1dp: score1dp,
        principal: score2dp,
    };
}

// =======================================================
// RUTAS DE LA API
// =======================================================

function isValidExtensionChatPassword(password) {
    const expectedPassword = String(process.env.CHATBOT_PASSWORD || '').trim();
    const receivedPassword = String(password || '').trim();

    return Boolean(expectedPassword) && receivedPassword === expectedPassword;
}

/**
 * POST /api/verify-password
 * Endpoint deprecado tras migración a Clerk.
 */
app.post('/api/verify-password', (req, res) => {
    return res.status(410).json({
        success: false,
        error: 'Endpoint deprecado. Usa autenticación Clerk con Authorization: Bearer <token>.',
    });
});

/**
 * POST /api/chat/validate-password
 * Valida la contraseña del chatbot usada por la extensión.
 */
app.post('/api/chat/validate-password', (req, res) => {
    const { password } = req.body || {};

    if (!String(process.env.CHATBOT_PASSWORD || '').trim()) {
        return res.status(500).json({
            ok: false,
            error: 'chatbot_password_not_configured',
            message: 'El backend no tiene configurada la contraseña del chatbot.',
        });
    }

    if (!password) {
        return res.status(400).json({
            ok: false,
            error: 'missing_password',
            message: 'Introduce la contraseña.',
        });
    }

    if (!isValidExtensionChatPassword(password)) {
        return res.status(401).json({
            ok: false,
            error: 'invalid_password',
            message: 'Contraseña incorrecta.',
        });
    }

    return res.json({ ok: true });
});

/**
 * POST /api/chatbot
 * Recibe una pregunta y un contexto sobre una noticia y devuelve la respuesta de un LLM.
 * body: { pregunta: string, contexto: { titulo: string, cuerpo: string, valoraciones: object } }
 */
app.post('/api/chatbot', requireAuth(), async (req, res) => {
    const permission = await resolveChatbotPermissionState(req, { enforce: true });
    if (!permission.ok) {
        return res.status(permission.status).json(permission.payload);
    }

    const { pregunta, contexto } = req.body;

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
        
        const scores = resolveGlobalScores(contexto);
        const puntuacionTexto = scores.principal === null ? 'N/A' : scores.principal.toFixed(2);
        contextoParaIA += `\nPuntuación Global: ${puntuacionTexto}/10\n`;
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
        const scores = resolveGlobalScores(resultado);
        const puntuacion = scores.principal;

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
            global_score_raw: scores.global_score_raw,
            global_score_2dp: scores.global_score_2dp,
            global_score_1dp: scores.global_score_1dp,
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
 * GET /api/news/context
 * Busca una noticia por URL y devuelve su contexto (análisis, metadatos) sin el embedding.
 * query: ?url=...
 */
app.get('/api/news/context', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: "El parámetro 'url' es requerido." });
    }

    try {
        const args = [url];
        // Ejecutamos buscar_noticia.py que ya maneja la lógica de búsqueda por URL
        const resultado = await ejecutarScriptPython('buscar_noticia.py', args);

        if (!resultado || resultado.mensaje === "Noticia no encontrada.") {
            return res.status(404).json({ ok: false, error: "Noticia no encontrada" });
        }

        // Limpiamos el resultado si fuera necesario, pero el script ya devuelve lo que necesitamos
        // Mapeamos a la estructura esperada por la extensión si hace falta, 
        // pero devolver el objeto completo de mongo es lo más flexible.
        return res.json({
            ok: true,
            news: resultado
        });

    } catch (error) {
        console.error('Error en /api/news/context:', error);
        return res.status(500).json({ 
            ok: false, 
            error: error.error || "Error interno del servidor al obtener contexto." 
        });
    }
});

/**
 * GET /api/news/:id/alerts
 * Devuelve alertas V2 y su resumen para una noticia concreta.
 */
app.get('/api/news/:id/alerts', requireAuth(), async (req, res) => {
    const { id } = req.params;
    if (!id || !/^[a-fA-F0-9]{24}$/.test(id)) {
        return res.status(400).json({ ok: false, error: "El parámetro ':id' debe ser un ObjectId válido." });
    }

    try {
        const news = await ejecutarScriptPython('buscar_noticia.py', [id]);
        if (!news || news.mensaje === "Noticia no encontrada.") {
            return res.status(404).json({ ok: false, error: "Noticia no encontrada." });
        }

        const alerts = news?.evaluation_result?.alerts ?? [];
        const alerts_summary = news?.evaluation_result?.alerts_summary ?? {
            counts: { high: 0, medium: 0, low: 0 },
            by_category: {},
            top: []
        };
        const audit = news?.evaluation_result?.audit ?? {
            rules_fired: [],
            inconsistencies: [],
            decision_path: []
        };

        return res.status(200).json({
            ok: true,
            news_id: id,
            alerts,
            alerts_summary,
            audit
        });
    } catch (error) {
        console.error('Error en /api/news/:id/alerts:', error);
        return res.status(500).json({
            ok: false,
            error: error.error || "Error interno del servidor al obtener alertas."
        });
    }
});

/**
 * POST /api/chat/news
 * Chatbot específico para la extensión. Recibe newsId, recupera el contexto del backend y llama a la IA.
 * body: { newsId: string, userMessage: string, previousMessages: array, password: string }
 */
app.post('/api/chat/news', async (req, res) => {
    const { newsId, userMessage, previousMessages, password } = req.body;

    if (!String(process.env.CHATBOT_PASSWORD || '').trim()) {
        return res.status(500).json({
            ok: false,
            error: 'chatbot_password_not_configured',
            message: 'El backend no tiene configurada la contraseña del chatbot.',
        });
    }

    if (!isValidExtensionChatPassword(password)) {
        return res.status(401).json({
            ok: false,
            error: 'AUTH_REQUIRED',
            message: 'Contraseña inválida o sesión expirada.',
        });
    }

    if (!newsId || !userMessage) {
        return res.status(400).json({ ok: false, error: "newsId y userMessage son requeridos." });
    }

    try {
        // 2. Recuperar el contexto de la noticia desde MongoDB usando el newsId
        const args = [newsId];
        const contexto = await ejecutarScriptPython('buscar_noticia.py', args);

        if (!contexto || contexto.mensaje === "Noticia no encontrada.") {
            return res.status(404).json({ ok: false, error: "Noticia no encontrada para generar respuesta." });
        }

        // 3. Construir el contexto para la IA (Reutilizando lógica de /api/chatbot)
        let contextoParaIA = `--- METADATOS ---\n`;
        contextoParaIA += `Título: "${contexto.titulo}"\n`;
        contextoParaIA += `Autor(es): "${contexto.autor || 'No especificado'}"\n`;
        contextoParaIA += `Fecha: "${contexto.fecha_publicacion || 'No especificada'}"\n`;
        contextoParaIA += `Fuente: "${contexto.fuente || 'No especificada'}"\n`;
        contextoParaIA += `URL: "${contexto.url || 'No especificada'}"\n\n`;

        contextoParaIA += `--- CUERPO DE LA NOTICIA ---\n"${contexto.cuerpo}"\n\n`;

        contextoParaIA += "--- ANÁLISIS DE CALIDAD (Valoraciones) ---\n";
        if (contexto.valoraciones) {
            for (const key in contexto.valoraciones) {
                const nombreParametro = NOMBRES_PARAMETROS[key] || `Parámetro ${key}`;
                contextoParaIA += `- ${nombreParametro}: ${contexto.valoraciones[key]}\n`;
            }
        }
        
        const scores = resolveGlobalScores(contexto);
        const puntuacionTexto = scores.principal === null ? 'N/A' : scores.principal.toFixed(2);
        contextoParaIA += `\nPuntuación Global: ${puntuacionTexto}/10\n`;
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

        // 4. Definir el prompt del sistema (Idéntico a /api/chatbot)
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

        // Construir historial de mensajes si existe
        const messages = [
            { role: "system", content: systemPrompt }
        ];

        // Añadimos mensajes previos si los hay (opcional, para contexto multi-turno)
        if (previousMessages && Array.isArray(previousMessages)) {
            // Filtramos y limitamos para seguridad y tokens
            const history = previousMessages.slice(-6); // Últimos 6 mensajes
            history.forEach(msg => {
                if (msg.role && msg.content) {
                    messages.push({ role: msg.role, content: msg.content });
                }
            });
        }

        // Añadimos el mensaje actual con el contexto
        // IMPORTANTE: En /api/chatbot enviamos el contexto en el mensaje del usuario. Hacemos lo mismo aquí.
        messages.push({
            role: "user",
            content: `Aquí está el contexto de la noticia:\n\n${contextoParaIA}\n\nMi pregunta es: ${userMessage}`
        });

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            temperature: 0,
            max_tokens: 4096,
        });

        const assistantMessage = completion.choices[0]?.message?.content?.trim();

        if (assistantMessage) {
            res.json({ ok: true, assistantMessage });
        } else {
            res.status(500).json({ ok: false, error: "No se pudo obtener una respuesta del servicio de IA." });
        }

    } catch (error) {
        console.error("Error en /api/chat/news:", error);
        res.status(500).json({ ok: false, error: "Error interno del servidor al procesar el chat." });
    }
});

/**
 * GET /api/history
 * Devuelve el historial de búsqueda del usuario autenticado.
 */
app.get('/api/history', requireAuth(), async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
        return res.status(401).json({ error: 'No autenticado.' });
    }

    try {
        const result = await ejecutarScriptPythonPorStdin(HISTORY_SCRIPT, {
            action: 'get_history',
            userId,
            limit: HISTORY_LIMIT,
        });
        return res.json({ items: Array.isArray(result?.items) ? result.items : [] });
    } catch (error) {
        console.error('Error en GET /api/history:', error);
        return res.status(500).json({
            error: error.error || 'Error interno del servidor al obtener historial.',
        });
    }
});

/**
 * POST /api/history
 * Actualiza el historial de búsqueda del usuario autenticado.
 * body: { query: string, title?: string, url?: string }
 */
app.post('/api/history', requireAuth(), async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
        return res.status(401).json({ error: 'No autenticado.' });
    }

    const query = normalizeHistoryQuery(req.body?.query);
    if (!query) {
        return res.status(400).json({ error: "El campo 'query' es requerido." });
    }

    try {
        const result = await ejecutarScriptPythonPorStdin(HISTORY_SCRIPT, {
            action: 'push_history',
            userId,
            limit: HISTORY_LIMIT,
            item: {
                query,
                title: normalizeNullableHistoryText(req.body?.title),
                url: normalizeNullableHistoryText(req.body?.url),
                timestamp: Date.now(),
            },
        });
        return res.json({ items: Array.isArray(result?.items) ? result.items : [] });
    } catch (error) {
        console.error('Error en POST /api/history:', error);
        return res.status(500).json({
            error: error.error || 'Error interno del servidor al actualizar historial.',
        });
    }
});

/**
 * POST /api/check-urls
 * Endpoint batch para verificar múltiples URLs a la vez usando spawn.
 * body: { urls: string[] }
 */
// Público para la extensión MV3: el service worker no envía token Clerk.
app.post('/api/check-urls', (req, res) => {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({ ok: false, error: "El campo 'urls' debe ser una lista." });
    }

    const count = urls.length;
    console.log(`[/api/check-urls] received URLs: ${count}`);

    if (count === 0) {
        return res.json({ ok: true, resultados: [] });
    }

    // Limitar el número de URLs para evitar abusos
    const MAX_BATCH_URLS = 100;
    if (count > MAX_BATCH_URLS) {
        return res.status(400).json({ 
            ok: false, 
            error: `/api/check-urls expects 1-${MAX_BATCH_URLS} URLs`,
            received: count
        });
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
            
            const resultadosList = resultado.resultados || [];
            console.log(`[/api/check-urls] resultados length: ${resultadosList.length}`);
            if (resultadosList.length > 0) {
                console.log(`[/api/check-urls] example resultado:`, JSON.stringify(resultadosList[0]));
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
app.post('/api/buscar', requireAuth(), async (req, res) => {
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

        // Auto-guardar en historial por usuario autenticado (fallo no bloqueante).
        const userId = req.auth?.userId;
        const query = normalizeHistoryQuery(identificador);
        if (userId && query && (resultado.titulo || resultado.url)) {
            try {
                await pushHistoryForUser(userId, {
                    query,
                    title: resultado.titulo,
                    url: resultado.url,
                });
            } catch (historyError) {
                console.warn('No se pudo actualizar historial en /api/buscar:', historyError);
            }
        }
        
        // Devuelve el objeto de la noticia encontrada (sin el embedding)
        res.json(resultado); 

    } catch (error) {
        console.error('Error en /api/buscar:', error);
        // Devuelve el error de ejecución de Python
        res.status(500).json({ error: error.error || "Error interno del servidor al ejecutar script de búsqueda." });
    }
});

app.use((error, req, res, next) => {
    if (error && (error.code === 'CORS_ORIGIN_DENIED' || error.message === 'Not allowed by CORS')) {
        return res.status(403).json({
            error: 'Origen no permitido por CORS.',
            origin: error.origin || null,
        });
    }
    return next(error);
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
    console.log(`🔐 Orígenes CORS permitidos: ${ALLOWED_ORIGINS.join(', ') || '(ninguno configurado)'}`);
    console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
});
