const mongoose = require('mongoose');

// Definir el esquema para los artículos
const articleSchema = new mongoose.Schema({
  Id_noticia: {
    type: Number,
    required: true, // Si quieres asegurarte de que siempre esté presente
  },
  score_noticia: {
    type: Number,
    required: true,
  },
  Comentarios: {
    type: String,
    required: true,
  }
});

// Exportar el modelo para poder usarlo en otros archivos
module.exports = mongoose.model('Noticia', articleSchema);;
