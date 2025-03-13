const mongoose = require('mongoose');

// Definir el esquema para los artículos
const articleSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true, // Si quieres asegurarte de que siempre esté presente
  },
  puntuacion: {
    type: Number,
    required: true,
  },
  texto_referencia: {
    type: String,
    required: true,
  }
});

// Exportar el modelo para poder usarlo en otros archivos
module.exports = mongoose.model('Noticias', articleSchema, 'Noticias');;
