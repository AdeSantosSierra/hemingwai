import React, { useState, forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { SignInButton, useAuth } from '@clerk/clerk-react';
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
    html = html.replace(/^### (.*$)/gim, '<h3 class="font-bold mt-3 mb-1 text-lg border-b border-white/10 pb-1">$1</h3>');
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

// Estilos con la paleta corporativa (Azul Oscuro y #d2d209)
const styles = {
    chatbotContainer: {
        // border: '1px solid #d2d209', // Borde removido para integrarse con glass
        borderRadius: '10px',
        padding: '8px',
        marginTop: '0',
        fontFamily: 'Inter, sans-serif', 
        backgroundColor: 'transparent', // Transparente para permitir glass del padre
        color: '#ffffff', // Texto base blanco
        // maxWidth eliminada para que llene la columna
        width: '100%',
        margin: '0',
        position: 'relative',
        minHeight: '600px', // Mayor altura mínima
        display: 'flex',
        flexDirection: 'column',
    },
    title: {
        margin: '0 0 20px 0',
        paddingBottom: '15px',
        borderBottom: '1px solid rgba(210, 210, 9, 0.3)', // Línea separadora sutil
        textAlign: 'center',
        color: '#d2d209', // Título en #d2d209
        fontSize: '1.25rem',
    },
    messagesContainer: {
        flex: '1', // Ocupa el espacio restante
        minHeight: '400px',
        overflowY: 'auto',
        border: '1px solid rgba(255,255,255,0.10)',
        padding: '16px',
        marginBottom: '16px',
        backgroundColor: 'rgba(255,255,255,0.03)', // Glass-like surface
        backdropFilter: 'blur(10px) saturate(130%)',
        WebkitBackdropFilter: 'blur(10px) saturate(130%)',
        borderRadius: '6px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
    },
    message: {
        marginBottom: '10px',
        padding: '10px 14px', // Increased padding
        borderRadius: '18px',
        maxWidth: '80%',
        wordWrap: 'break-word',
        lineHeight: '1.5',
    },
    userMessage: {
        backgroundColor: '#d2d209', // Fondo #d2d209
        color: '#001a33', // Texto oscuro para contraste
        alignSelf: 'flex-end',
        marginLeft: 'auto',
        boxShadow: '0 8px 18px rgba(0,0,0,0.25)', // Tiny shadow
    },
    botMessage: {
        backgroundColor: 'rgba(255,255,255,0.04)', // Glass message
        border: '1px solid rgba(255,255,255,0.10)',
        backdropFilter: 'blur(8px)',
        color: '#ffffff', // Texto blanco
        alignSelf: 'flex-start',
    },
    form: {
        display: 'flex',
    },
    input: {
        flex: '1',
        padding: '10px',
        borderRadius: '20px',
        border: '1px solid rgba(210, 210, 9, 0.5)',
        marginRight: '10px',
        backgroundColor: 'rgba(5, 15, 30, 0.6)', // Fondo oscuro transparente
        color: '#ffffff', // Texto blanco
        outline: 'none',
    },
    button: {
        padding: '10px 20px',
        borderRadius: '20px',
        border: 'none',
        backgroundColor: '#d2d209', // Botón #d2d209
        color: '#001a33', // Texto botón oscuro
        cursor: 'pointer',
        fontWeight: 'bold',
        boxShadow: '0 10px 24px rgba(210,210,9,0.18)',
    },
    buttonDisabled: {
        backgroundColor: 'rgba(210, 210, 9, 0.3)', // Lower opacity lime
        color: 'rgba(255, 255, 255, 0.5)',
        cursor: 'not-allowed',
        boxShadow: 'none',
    },
    error: {
        color: '#ff6b6b', // Un rojo suave que se lea bien sobre azul oscuro
        textAlign: 'center',
        marginTop: '10px',
    },
    loading: {
        textAlign: 'center',
        color: '#d2d209', // "Pensando..." en #d2d209
    },
    // Estilos para la pantalla de bloqueo
    lockScreen: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(6, 18, 33, 0.55)', // Glass-like overlay
        backdropFilter: 'blur(14px) saturate(130%)',
        WebkitBackdropFilter: 'blur(14px) saturate(130%)',
        border: '1px solid rgba(210, 210, 9, 0.18)',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: '8px',
        padding: '20px',
    },
    lockTitle: {
        color: '#d2d209',
        marginBottom: '15px',
        fontSize: '1.2em',
        textAlign: 'center',
    },
    lockInput: {
        padding: '10px',
        borderRadius: '20px',
        border: '1px solid #d2d209',
        marginBottom: '15px',
        backgroundColor: 'rgba(5, 15, 30, 0.6)', // Dark background
        color: '#fff',
        width: '80%',
        maxWidth: '300px',
        textAlign: 'center',
        outline: 'none',
    }
};

const Chatbot = forwardRef(({ noticiaContexto }, ref) => {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [mensajes, setMensajes] = useState([
        { role: 'bot', content: 'Hola. ¿Qué te gustaría saber sobre el análisis de esta noticia?' }
    ]);
    const [inputUsuario, setInputUsuario] = useState('');
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);

    const [authError, setAuthError] = useState(null);

    // Refs
    const containerRef = useRef(null);

    // Lógica principal de envío de mensaje
    const sendMessage = useCallback(async (textoMensaje) => {
        if (!textoMensaje || !textoMensaje.trim() || cargando) return;
        if (!isLoaded || !isSignedIn) {
            setAuthError('Inicia sesión para usar el chatbot.');
            return;
        }

        const nuevoMensajeUsuario = { role: 'user', content: textoMensaje };
        setMensajes(prevMensajes => [...prevMensajes, nuevoMensajeUsuario]);
        // Limpiamos el input si el mensaje vino del input
        if (inputUsuario === textoMensaje) {
            setInputUsuario('');
        }
        
        setCargando(true);
        setError(null);
        setAuthError(null);

        try {
            const token = await getToken();
            if (!token) {
                throw new Error('No se pudo obtener el token de sesión.');
            }

            const response = await fetch(`${API_BASE_URL}/api/chatbot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    pregunta: textoMensaje,
                    contexto: noticiaContexto
                }),
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('No autorizado. Vuelve a iniciar sesión.');
                }
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
    }, [cargando, getToken, inputUsuario, isLoaded, isSignedIn, noticiaContexto]);

    // Exponer métodos al padre
    useImperativeHandle(ref, () => ({
        handleQuickQuestion: (question) => {
            if (!isSignedIn) {
                if (containerRef.current) {
                    containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                setAuthError('Para hacer esta pregunta, primero inicia sesión.');
                return;
            }
            sendMessage(question);
        }
    }), [isSignedIn, sendMessage]);

    const handleSubmit = (e) => {
        e.preventDefault();
        sendMessage(inputUsuario);
    };

    return (
        <div style={styles.chatbotContainer} ref={containerRef}>
            {/* Pantalla de Bloqueo */}
            {(!isLoaded || !isSignedIn) && (
                <div style={styles.lockScreen}>
                    <h3 style={styles.lockTitle}>🔒 Chatbot Protegido</h3>
                    <p className="text-white mb-4 text-center text-sm">
                        Inicia sesión con Google para acceder al asistente.
                    </p>
                    {isLoaded && (
                        <SignInButton mode="modal">
                            <button type="button" style={styles.button}>
                                Iniciar sesión
                            </button>
                        </SignInButton>
                    )}
                    {!isLoaded && <p className="text-white/80 text-sm">Cargando sesión...</p>}
                    {authError && <p style={styles.error}>{authError}</p>}
                </div>
            )}

            <h3 style={styles.title}>Pregúntale a la IA más información</h3>
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
                    disabled={cargando || !isLoaded || !isSignedIn}
                    // Adding focus class via className prop
                    className="focus:shadow-[0_0_0_2px_rgba(210,210,9,0.2)] transition-shadow duration-200 placeholder-gray-400"
                />
                <button 
                    type="submit" 
                    style={{...styles.button, ...(cargando || !isLoaded || !isSignedIn ? styles.buttonDisabled : {})}} 
                    disabled={cargando || !isLoaded || !isSignedIn}
                >
                    Enviar
                </button>
            </form>
            {error && <p style={styles.error}>{error}</p>}
        </div>
    );
});

Chatbot.displayName = 'Chatbot';

Chatbot.propTypes = {
    noticiaContexto: PropTypes.shape({
        titulo: PropTypes.string.isRequired,
        cuerpo: PropTypes.string.isRequired,
        valoraciones: PropTypes.object.isRequired,
        fact_check_analisis: PropTypes.string,
        fact_check_fuentes: PropTypes.array,
        texto_referencia_diccionario: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),
        valoracion_titular: PropTypes.object,
        autor: PropTypes.oneOfType([PropTypes.string, PropTypes.array]),
        url: PropTypes.string,
        fecha_publicacion: PropTypes.string,
        fuente: PropTypes.string,
        keywords: PropTypes.oneOfType([PropTypes.string, PropTypes.array]),
        tags: PropTypes.oneOfType([PropTypes.string, PropTypes.array]),
        puntuacion: PropTypes.number,
        puntuacion_individual: PropTypes.object,
    }).isRequired,
};

export default Chatbot;
