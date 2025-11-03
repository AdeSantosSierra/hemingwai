// Archivo principal del servidor Express.js
// Escucha peticiones del frontend y orquesta la ejecución de scripts de Python.

const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;
const PYTHON_SCRIPT_DIR = path.join(__dirname, '..', 'src');

// 🌟 CORRECCIÓN DE RUTA CRÍTICA 🌟
// Reemplaza ESTA RUTA si 'which python' te dio una ruta diferente a la predeterminada.
// Si which python te dio /home/roberto/hemingwai/.venv/bin/python, déjalo así.
const PYTHON_INTERPRETER = '/home/roberto/hemingwai/.venv/bin/python'; 


// Middleware
app.use(cors()); // Permite que el frontend (puerto 5174) se conecte
app.use(express.json()); // Para parsear cuerpos de petición JSON

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

/**
 * POST /api/analizar
 * Fuerza el análisis de una noticia existente en la BD antigua.
 * body: { identificador: 'url_o_id' }
 */
app.post('/api/analizar', async (req, res) => {
    const { identificador } = req.body;

    if (!identificador) {
        return res.status(400).json({ error: "El campo 'identificador' es requerido para el análisis." });
    }

    // 1. Primero, verificamos si la noticia existe en la BD antigua para obtener su ID
    let noticiaId = identificador;

    // Si el identificador no es un ObjectId válido, lo buscamos con el script
    if (!identificador.match(/^[0-9a-fA-F]{24}$/)) {
        try {
            // Buscamos solo en la BD antigua
            const resultadoBusqueda = await ejecutarScriptPython('buscar_noticia.py', [identificador, '--solo-antigua']);

            if (resultadoBusqueda.mensaje === "Noticia no encontrada.") {
                return res.status(404).json({ error: "Noticia no encontrada en la BD antigua para análisis." });
            }
            noticiaId = resultadoBusqueda._id; // Obtenemos el ID para pasárselo a analiza_y_guarda.py

        } catch (error) {
            return res.status(500).json({ error: error.error || "Error al verificar existencia de noticia antes de analizar." });
        }
    }


    // 2. Ejecutamos el script de análisis con el ID
    try {
        // Ejecutamos analiza_y_guarda.py con el ID como argumento.
        // Asumimos que analiza_y_guarda.py ya maneja la lógica de análisis a partir del ID.
        const resultadoAnalisis = await ejecutarScriptPython('analiza_y_guarda.py', [noticiaId]);

        res.json({
            mensaje: `Análisis iniciado para ID ${noticiaId}.`,
            resultado: resultadoAnalisis // El script debería devolver un JSON de confirmación o resultado
        });

    } catch (error) {
        console.error('Error en /api/analizar:', error);
        res.status(500).json({ error: error.error || "Error interno del servidor al ejecutar script de análisis." });
    }
});


// Inicio del servidor
app.listen(PORT, () => {
    console.log(`API escuchando en puerto ${PORT}...`);
    console.log(`Ruta de intérprete Python: ${PYTHON_INTERPRETER}`);
});
