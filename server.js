// Para ejecutar -> nodemon server.js
// Para subir a render -> Commit, push y esperar a que haga deploy
// Si has cambiado .env -> Hay que actualizar "Environment" en render


// Cargar las variables de entorno
require('dotenv').config();
console.log("URI:", process.env.MONGODB_URI);

const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  dbName: 'Base_de_datos_noticias'  // Especificar explícitamente la base de datos
})
.then(() => {
  console.log("✅ Conectado a MongoDB");
  // Mostrar información de la conexión
  console.log("Base de datos:", mongoose.connection.db.databaseName);
  console.log("Colecciones disponibles:", mongoose.connection.db.listCollections().toArray());
})
.catch(err => {
  console.error("❌ Error al conectar a MongoDB:", err.message);
});

const express = require('express');
const cors = require('cors');
console.log("Ejecutando server.js");

const NoticiasProcesadas = require('./models/NoticiaProcesada'); 
const app = express();
const port = process.env.PORT || 3000;

// Middleware para que Express maneje los JSON
app.use(express.json());
app.use(cors()); 

// Ruta de ejemplo
app.get('/', (req, res) => {
    res.send('¡Hola desde el backend de Node.js!');
}); 

// Endpoint GET para obtener artículos por URL
app.get('/url', async (req, res) => {
  const url = req.query.url

  console.log('req.query')
  console.log(req.query)
  console.log(req.query.url)
  console.log(url)

  try {
    // Construir los criterios de búsqueda
    let query = {};

    // Filtrar por título usando regex (sin importar mayúsculas/minúsculas)
    query = {url}

    console.log('por aquí pasa')
    console.log(query)

    // Obtener los artículos de la base de datos
    const articles = await NoticiasProcesadas.findOne(query);

    console.log('por aquí pasa 0')
    console.log('Artículo encontrado:', articles ? {
      url: articles.url,
      puntuacion: articles.puntuacion,
      tienePuntuacion: articles.puntuacion !== undefined,
      tipoPuntuacion: articles.puntuacion ? typeof articles.puntuacion : 'undefined'
    } : 'No se encontró artículo');

    console.log('por aquí pasa 1')

    // Enviar los artículos como respuesta
    res.status(200).json(articles);
  } catch (err) {
    res.status(500).json({ message: 'Error obteniendo los artículos', error: err});
  }
});

// Endpoint GET para obtener una noticia aleatoria
app.get('/random', async (req, res) => {
  try {
    // Mostrar información de la conexión actual
    console.log("Base de datos actual:", mongoose.connection.db.databaseName);
    
    const count = await NoticiasProcesadas.countDocuments();
    console.log('Número total de documentos:', count);
    
    if (count === 0) {
      return res.status(404).json({ 
        message: 'No se encontraron noticias',
        database: mongoose.connection.db.databaseName,
        collection: NoticiasProcesadas.collection.name
      });
    }

    const random = Math.floor(Math.random() * count);
    const noticia = await NoticiasProcesadas.findOne().skip(random);
    
    if (!noticia) {
      return res.status(404).json({ 
        message: 'No se encontró la noticia aleatoria',
        database: mongoose.connection.db.databaseName,
        collection: NoticiasProcesadas.collection.name
      });
    }

    console.log('Noticia aleatoria encontrada:', {
      url: noticia.url,
      puntuacion: noticia.puntuacion,
      tienePuntuacion: noticia.puntuacion !== undefined,
      tipoPuntuacion: noticia.puntuacion ? typeof noticia.puntuacion : 'undefined'
    });
    
    res.status(200).json(noticia);
  } catch (err) {
    console.error("Error en /random:", err);
    res.status(500).json({ 
      message: 'Error obteniendo la noticia aleatoria', 
      error: err.message,
      database: mongoose.connection.db.databaseName,
      collection: NoticiasProcesadas.collection.name
    });
  }
});

// Iniciar el servidor en el puerto especificado
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
