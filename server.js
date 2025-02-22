// Importamos las dependencias
const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

// Creamos la aplicación Express
const app = express();

// Usamos JSON para las peticiones
app.use(express.json());

// Configuramos la conexión a MongoDB Atlas
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Conectado a MongoDB Atlas'))
  .catch((err) => console.log('Error al conectar a MongoDB: ', err));

// Definir un modelo de Item
const Item = mongoose.model('Item', new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  createdAt: { type: Date, default: Date.now }
}));

// Rutas
app.get('/', (req, res) => {
  res.send('Servidor funcionando');
});

// Ruta para obtener todos los ítems
app.get('/items', async (req, res) => {
  try {
    const items = await Item.find();
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Ruta para agregar un nuevo ítem
app.post('/items', async (req, res) => {
  const newItem = new Item({
    name: req.body.name,
    description: req.body.description
  });

  try {
    const savedItem = await newItem.save();
    res.status(201).json(savedItem);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Iniciar el servidor
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
