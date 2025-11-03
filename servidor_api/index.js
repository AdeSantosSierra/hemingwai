const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000; // Puerto para el backend

// Middlewares
app.use(cors());
app.use(express.json());

// Definir la ruta raíz del proyecto para construir rutas absolutas
const ROOT_DIR = path.resolve(__dirname, '..');
const PYTHON_EXECUTABLE = path.join(ROOT_DIR, '.venv', 'bin', 'python');

/**
 * Endpoint para buscar una noticia por URL o ID.
 * Espera un parámetro 'q' en la query string.
 * Ejemplo: /api/buscar?q=URL_o_ID
 */
app.get('/api/buscar', (req, res) => {
    const { q } = req.query;
    if (!q) {
        return res.status(400).json({ error: 'El parámetro "q" (URL o ID) es requerido.' });
    }

    const scriptPath = path.join(ROOT_DIR, 'src', 'buscar_noticia.py');
    const pythonProcess = spawn(PYTHON_EXECUTABLE, [scriptPath, q]);

    let data = '';
    pythonProcess.stdout.on('data', (chunk) => {
        data += chunk.toString();
    });

    let error = '';
    pythonProcess.stderr.on('data', (chunk) => {
        error += chunk.toString();
    });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`Error en script de búsqueda: ${error}`);
            return res.status(500).json({ error: 'Error al ejecutar el script de búsqueda.', details: error });
        }
        try {
            res.json(JSON.parse(data));
        } catch (e) {
            console.error(`Error al parsear JSON: ${e}`);
            res.status(500).json({ error: 'La respuesta del script no es un JSON válido.', details: data });
        }
    });
});

/**
 * Endpoint para analizar una noticia existente en la base de datos antigua.
 * Espera un body con { "identifier": "URL_o_ID" }
 */
app.post('/api/analizar', (req, res) => {
    const { identifier } = req.body;
    if (!identifier) {
        return res.status(400).json({ error: 'El campo "identifier" (URL o ID) es requerido.' });
    }

    // Paso 1: Usar el script de búsqueda para encontrar la noticia en la DB antigua
    // (Asumimos que el script de búsqueda puede manejar esto y devolver el ID)
    const findScriptPath = path.join(ROOT_DIR, 'src', 'buscar_noticia.py');
    const findProcess = spawn(PYTHON_EXECUTABLE, [findScriptPath, identifier, '--solo-antigua']);

    let findData = '';
    findProcess.stdout.on('data', (chunk) => {
        findData += chunk.toString();
    });

    let findError = '';
    findProcess.stderr.on('data', (chunk) => {
        findError += chunk.toString();
    });

    findProcess.on('close', (code) => {
        if (code !== 0) {
             return res.status(500).json({ error: 'Error al buscar la noticia para analizar.', details: findError });
        }

        try {
            const noticia = JSON.parse(findData);
            if (!noticia || noticia.mensaje === "Noticia no encontrada.") {
                return res.status(404).json({ error: 'Noticia no encontrada en la base de datos antigua.' });
            }

            const noticiaId = noticia._id;
            
            // Paso 2: Ejecutar el script de análisis con el ID encontrado
            const analyzeScriptPath = path.join(ROOT_DIR, 'src', 'analiza_y_guarda.py');
            const analyzeProcess = spawn(PYTHON_EXECUTABLE, [analyzeScriptPath, noticiaId]);

            // No esperamos una respuesta larga, solo confirmación
            analyzeProcess.on('close', (analyzeCode) => {
                if (analyzeCode !== 0) {
                    return res.status(500).json({ error: `El proceso de análisis falló con código ${analyzeCode}.` });
                }
                res.status(200).json({ mensaje: `Análisis de la noticia ${noticiaId} iniciado correctamente.` });
            });

        } catch (e) {
            res.status(500).json({ error: 'La respuesta del script de búsqueda no fue válida.', details: findData });
        }
    });
});


app.listen(port, () => {
    console.log(`Servidor backend escuchando en http://localhost:${port}`);
});
