import React, { useState } from 'react';
import PropTypes from 'prop-types';
import API_BASE_URL from '../apiConfig';

// Estilos básicos en línea para el chatbot
const styles = {
    chatbotContainer: {
        border: '1px solid #ccc',
        borderRadius: '8px',
        padding: '16px',
        marginTop: '20px',
        fontFamily: 'Arial, sans-serif',
        backgroundColor: '#f9f9f9',
        maxWidth: '700px',
        margin: '20px auto',
    },
    title: {
        margin: '0 0 16px 0',
        paddingBottom: '10px',
        borderBottom: '1px solid #eee',
        textAlign: 'center',
        color: '#333',
    },
    messagesContainer: {
        height: '300px',
        overflowY: 'auto',
        border: '1px solid #eee',
        padding: '10px',
        marginBottom: '10px',
        backgroundColor: '#fff',
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
        backgroundColor: '#007bff',
        color: 'white',
        alignSelf: 'flex-end',
        marginLeft: 'auto',
    },
    botMessage: {
        backgroundColor: '#e9ecef',
        color: '#495057',
        alignSelf: 'flex-start',
    },
    form: {
        display: 'flex',
    },
    input: {
        flex: '1',
        padding: '10px',
        borderRadius: '20px',
        border: '1px solid #ccc',
        marginRight: '10px',
    },
    button: {
        padding: '10px 20px',
        borderRadius: '20px',
        border: 'none',
        backgroundColor: '#007bff',
        color: 'white',
        cursor: 'pointer',
    },
    buttonDisabled: {
        backgroundColor: '#aaa',
        cursor: 'not-allowed',
    },
    error: {
        color: 'red',
        textAlign: 'center',
        marginTop: '10px',
    },
    loading: {
        textAlign: 'center',
        color: '#555',
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
            // Opcional: añadir un mensaje del bot indicando el error
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
                {mensajes.map((msg, index) => (
                    <div key={index} style={{
                        ...styles.message,
                        ...(msg.role === 'user' ? styles.userMessage : styles.botMessage)
                    }}>
                        {msg.content}
                    </div>
                ))}
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
