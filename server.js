// Para ejecutar -> nodemon server.js
// Para subir a render -> Commit, push y esperar a que haga deploy
// Si has cambiado .env -> Hay que actualizar "Environment" en render


// Cargar las variables de entorno
require('dotenv').config();
console.log("URI:", process.env.MONGO_URI);

const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log("✅ Conectado a MongoDB");
})
.catch(err => {
  console.error("❌ Error al conectar a MongoDB:", err.message);
});



const express = require('express');
const cors = require('cors');
console.log("Ejecutando server hola.js");
// const mongoose = require('mongoose');
// const Noticia = require('./models/Articles'); 

// const Noticias = require('./models/Noticia'); 
const NoticiasProcesadas = require('./models/NoticiaProcesada'); 
const app = express();
const port = process.env.PORT || 3000;

console.log("Ejecutando server.js");

// Conexión a MongoDB Atlas
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Conectado a MongoDB Atlas');
}).catch((err) => {
    console.error('Error de conexión a MongoDB Atlas:', err);
});




// Middleware para que Express maneje los JSON
app.use(express.json());
app.use(cors()); 

// Ruta de ejemplo
app.get('/', (req, res) => {
    res.send('¡Hola desde el backend de Node.js por partida doble!');
}); 


// Endpoint GET para obtener artículos con filtros opcionales
app.get('/articles', async (req, res) => {
  const Id_noticia = parseInt(req.query.Id_noticia)

  console.log(req.query)
  console.log(req.query.Id_noticia)
  console.log(Id_noticia)

  try {
    // Construir los criterios de búsqueda
    let query = {};

    // Filtrar por título usando regex (sin importar mayúsculas/minúsculas)
    query = {Id_noticia}

    console.log('por aquí pasa')
    console.log(query)
    console.log(query)

    // Obtener los artículos de la base de datos
    const articles = await Noticia.findOne(query);

    console.log(articles)

    console.log('por aquí pasa 1')

    // Enviar los artículos como respuesta
    res.status(200).json(articles);
  } catch (err) {
    res.status(500).json({ message: 'Error obteniendo los artículos', error: err});
  }
});

// Endpoint GET para obtener artículos con filtros opcionales
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
    console.log(articles)

    console.log('por aquí pasa 1')

    // Enviar los artículos como respuesta
    res.status(200).json(articles);
  } catch (err) {
    res.status(500).json({ message: 'Error obteniendo los artículos', error: err});
  }
});



// Iniciar el servidor en el puerto especificado
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
