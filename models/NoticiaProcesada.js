const mongoose = require('mongoose');

// Definir el esquema para los artículos
const noticiaSchema = new mongoose.Schema({
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
  },
//   texto_referencia_diccionario: {
//     type: String,
//     required: true,
//   },
//   valoraciones_html: {
//         type: String,
//         required: true,
//     }
});

// Exportar el modelo para poder usarlo en otros archivos
// Esto tiene qu ser igual que el nombre de la colección en MongoDB
// 'Noticias' es el nombre del modelo y 'Noticias' es el nombre de la colección
module.exports = mongoose.model('Noticias', noticiaSchema, 'Noticias');
