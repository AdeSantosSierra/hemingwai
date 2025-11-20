import React, { useState } from 'react';
import PropTypes from 'prop-types';
import API_BASE_URL from '../apiConfig';

// --- Renderizado Markdown ---
// Función helper para renderizar el Markdown que devuelve la IA
const renderMarkdown = (text) => {
    if (!text) return '';
    let html = String(text);

    // Sanitizar etiquetas HTML básicas para evitar inyección, pero permitiendo nuestro formato
    html = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // --- Formato Markdown Básico ---
    
    // Títulos (### Título) -> <h3>
    html = html.replace(/^### (.*$)/gim, '<h3 class="font-bold mt-3 mb-1 text-lg border-b border-gray-200 pb-1">$1</h3>');
    // Títulos (## Título) -> <h2>
    html = html.replace(/^## (.*$)/gim, '<h2 class="font-bold mt-3 mb-1 text-xl">$1</h2>');
    
    // Negritas (**texto**) -> <strong>
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    // Cursivas (*texto*) -> <em>
    html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

    // Listas no ordenadas (- elemento)
    // Primero envolvemos los items de lista
    html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');
    // Luego envolvemos grupos de <li> en <ul>
    // Nota: Esta regex es simple y asume bloques contiguos.
    html = html.replace(/(<li>.*<\/li>)/gims, (match) => {
        // Si ya está envuelto (por recursión o error), no lo envolvemos de nuevo
        if (match.includes('<ul>')) return match; 
        return `<ul class="list-disc ml-5 mb-2 space-y-1">${match}</ul>`;
    });

    // Listas ordenadas (1. elemento)
    // Similar lógica simplificada
    html = html.replace(/^\s*\d+\.\s+(.*)$/gim, '<li>$1</li>');
    // Envolver en <ol> si detectamos items que parecen de lista ordenada (esto es truculento con regex simple)
    // Para simplificar y evitar conflictos con <ul>, asumiremos que si la IA usa números, queremos lista ordenada.
    // Pero el reemplazo anterior ya los convirtió a <li>.
    // Una mejora sería diferenciar en el paso anterior.
    
    // Párrafos: separar por dobles saltos de línea
    const paragraphs = html
        .split(/\n{2,}/)
        .map((p) => {
            // Si el párrafo ya empieza con una etiqueta de bloque (h3, ul), no poner <p>
            if (p.trim().startsWith('<h') || p.trim().startsWith('<ul') || p.trim().startsWith('<li')) {
                return p;
            }
            return `<p class="mb-2">${p.trim()}</p>`;
        })
        .join('');

    return paragraphs;
};
// ----------------------------

// Estilos actualizados con la paleta corporativa (Azul Oscuro y Lima)
const styles = {
    chatbotContainer: {
        border: '1px solid #d2d209', // Borde lima
        borderRadius: '8px',
        padding: '16px',
        marginTop: '20px',
        fontFamily: 'Inter, sans-serif', 
        backgroundColor: '#0A2342', // Azul oscuro de fondo
        color: '#ffffff', // Texto base blanco
        maxWidth: '700px',
        margin: '20px auto',
    },
    title: {
        margin: '0 0 16px 0',
        paddingBottom: '10px',
        borderBottom: '1px solid #d2d209', // Línea separadora lima
        textAlign: 'center',
        color: '#d2d209', // Título en lima
    },
    messagesContainer: {
        height: '300px',
        overflowY: 'auto',
        border: '1px solid #1c3d6e',
        padding: '10px',
        marginBottom: '10px',
        backgroundColor: '#0e2f56', // Azul ligeramente más claro para el área de mensajes
        borderRadius: '4px',
    },
    message: {
        marginBottom: '10px',
        padding: '8px 12px',
        borderRadius: '18px',
        maxWidth: '80%',
        wordWrap: 'break-word',
    },
    userMessage: {
        backgroundColor: '#d2d209', // Fondo lima
        color: '#0A2342', // Texto oscuro para contraste
        alignSelf: 'flex-end',
        marginLeft: 'auto',
    },
    botMessage: {
        backgroundColor: '#ffffff', // Fondo blanco
        color: '#0A2342', // Texto oscuro
        alignSelf: 'flex-start',
    },
    form: {
        display: 'flex',
    },
    input: {
        flex: '1',
        padding: '10px',
        borderRadius: '20px',
        border: '1px solid #d2d209',
        marginRight: '10px',
        backgroundColor: '#ffffff', // Fondo blanco para escribir
        color: '#000000', // Texto negro explícito
    },
    button: {
        padding: '10px 20px',
        borderRadius: '20px',
        border: 'none',
        backgroundColor: '#d2d209', // Botón lima
        color: '#0A2342', // Texto botón oscuro
        cursor: 'pointer',
        fontWeight: 'bold',
    },
    buttonDisabled: {
        backgroundColor: '#555',
        color: '#888',
        cursor: 'not-allowed',
    },
    error: {
        color: '#ff6b6b', // Un rojo suave que se lea bien sobre azul oscuro
        textAlign: 'center',
        marginTop: '10px',
    },
    loading: {
        textAlign: 'center',
        color: '#d2d209', // "Pensando..." en lima
    }
};

const Chatbot = ({ noticiaContexto }) => {
    const [mensajes, setMensajes] = useState([
        { role: 'bot', content: 'Hola. ¿Qué te gustaría saber sobre el análisis de esta noticia?' }
    ]);
    const [inputUsuario, setInputUsuario] = useState('');
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!inputUsuario.trim() || cargando) return;

        const nuevoMensajeUsuario = { role: 'user', content: inputUsuario };
        setMensajes(prevMensajes => [...prevMensajes, nuevoMensajeUsuario]);
        setInputUsuario('');
        setCargando(true);
        setError(null);

        try {
            const response = await fetch(`${API_BASE_URL}/api/chatbot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    pregunta: inputUsuario,
                    contexto: noticiaContexto,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Ocurrió un error en el servidor.');
            }

            const data = await response.json();
            const respuestaBot = { role: 'bot', content: data.respuesta };
            setMensajes(prev => [...prev, respuestaBot]);

        } catch (err) {
            setError(err.message || 'No se pudo conectar con el chatbot. Inténtalo de nuevo.');
            const mensajeErrorBot = { role: 'bot', content: 'Lo siento, he tenido un problema para procesar tu pregunta.' };
            setMensajes(prev => [...prev, mensajeErrorBot]);
        } finally {
            setCargando(false);
        }

    };

    return (
        <div style={styles.chatbotContainer}>
            <h3 style={styles.title}>Pregúntale a Hemingwai</h3>
            <div style={styles.messagesContainer}>
                {mensajes.map((msg, index) => {
                    const isUser = msg.role === 'user';
                    return (
                        <div key={index} style={{
                            ...styles.message,
                            ...(isUser ? styles.userMessage : styles.botMessage)
                        }}>
                            {/* Si es usuario, mostramos texto plano. Si es bot, renderizamos HTML (Markdown) */}
                            {isUser ? (
                                msg.content
                            ) : (
                                <div 
                                    className="prose prose-sm max-w-none text-inherit"
                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} 
                                />
                            )}
                        </div>
                    );
                })}
                {cargando && <div style={styles.loading}>Pensando...</div>}
            </div>
            <form onSubmit={handleSubmit} style={styles.form}>
                <input
                    type="text"
                    value={inputUsuario}
                    onChange={(e) => setInputUsuario(e.target.value)}
                    placeholder="Escribe tu pregunta aquí..."
                    style={styles.input}
                    disabled={cargando}
                />
                <button type="submit" style={{...styles.button, ...(cargando ? styles.buttonDisabled : {})}} disabled={cargando}>
                    Enviar
                </button>
            </form>
            {error && <p style={styles.error}>{error}</p>}
        </div>
    );
};

Chatbot.propTypes = {
    noticiaContexto: PropTypes.shape({
        titulo: PropTypes.string.isRequired,
        cuerpo: PropTypes.string.isRequired,
        valoraciones: PropTypes.object.isRequired,
    }).isRequired,
};

export default Chatbot;
