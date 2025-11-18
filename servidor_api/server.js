// Archivo principal del servidor Express.js
// Escucha peticiones del frontend y orquesta la ejecución de scripts de Python.

const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const path = require('path');

const app = express();

// IMPORTANTE: Usar variable de entorno PORT para Render
const PORT = process.env.PORT || 3000;

const PYTHON_SCRIPT_DIR = path.join(__dirname, '..', 'src');

// El intérprete de Python se resuelve automáticamente desde el PATH del entorno virtual definido en el Dockerfile.
const PYTHON_INTERPRETER = 'python'; 

// Middleware
// Configuración de CORS para permitir explícitamente el origen del frontend en Render
const corsOptions = {
    origin: 'https://hemingwai-frontend-5vw6.onrender.com',
    optionsSuccessStatus: 200 // Para compatibilidad con navegadores antiguos o proxies
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
// RUTAS DE LA API
// =======================================================

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