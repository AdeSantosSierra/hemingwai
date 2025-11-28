import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
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

// Estilos con la paleta corporativa (Azul Oscuro y #d2d209)
const styles = {
    chatbotContainer: {
        border: '1px solid #d2d209', // Borde #d2d209
        borderRadius: '10px',
        padding: '8px',
        marginTop: '0',
        fontFamily: 'Inter, sans-serif', 
        backgroundColor: '#001a33', // Azul oscuro de fondo
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
        borderBottom: '1px solid #d2d209', // Línea separadora #d2d209
        textAlign: 'center',
        color: '#d2d209', // Título en #d2d209
        fontSize: '1.25rem',
    },
    messagesContainer: {
        flex: '1', // Ocupa el espacio restante
        minHeight: '400px',
        overflowY: 'auto',
        border: '1px solid #1c3d6e',
        padding: '16px',
        marginBottom: '16px',
        backgroundColor: '#0e2f56', // Azul ligeramente más claro para el área de mensajes
        borderRadius: '6px',
    },
    message: {
        marginBottom: '10px',
        padding: '8px 12px',
        borderRadius: '18px',
        maxWidth: '80%',
        wordWrap: 'break-word',
    },
    userMessage: {
        backgroundColor: '#d2d209', // Fondo #d2d209
        color: '#001a33', // Texto oscuro para contraste
        alignSelf: 'flex-end',
        marginLeft: 'auto',
    },
    botMessage: {
        backgroundColor: '#ffffff', // Fondo blanco
        color: '#001a33', // Texto oscuro
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
        backgroundColor: '#d2d209', // Botón #d2d209
        color: '#001a33', // Texto botón oscuro
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
        color: '#d2d209', // "Pensando..." en #d2d209
    },
    // Estilos para la pantalla de bloqueo
    lockScreen: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(10, 35, 66, 0.98)', // Azul oscuro semi-opaco
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
        backgroundColor: '#ffffff',
        color: '#000000',
        width: '80%',
        maxWidth: '300px',
        textAlign: 'center',
    }
};

const Chatbot = forwardRef(({ noticiaContexto }, ref) => {
    const [mensajes, setMensajes] = useState([
        { role: 'bot', content: 'Hola. ¿Qué te gustaría saber sobre el análisis de esta noticia?' }
    ]);
    const [inputUsuario, setInputUsuario] = useState('');
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);

    // Estado para la autenticación
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [authError, setAuthError] = useState(null);
    const [verifying, setVerifying] = useState(false);

    // Refs
    const passwordInputRef = useRef(null);
    const containerRef = useRef(null);

    // Lógica principal de envío de mensaje
    const sendMessage = async (textoMensaje) => {
        if (!textoMensaje || !textoMensaje.trim() || cargando) return;

        const nuevoMensajeUsuario = { role: 'user', content: textoMensaje };
        setMensajes(prevMensajes => [...prevMensajes, nuevoMensajeUsuario]);
        // Limpiamos el input si el mensaje vino del input
        if (inputUsuario === textoMensaje) {
            setInputUsuario('');
        }
        
        setCargando(true);
        setError(null);

        try {
            const response = await fetch(`${API_BASE_URL}/api/chatbot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    pregunta: textoMensaje,
                    contexto: noticiaContexto,
                    password: passwordInput // Enviar la contraseña autenticada con cada petición
                }),
            });

            if (!response.ok) {
                // Si falla la autenticación en medio de la sesión (ej: reinicio de servidor)
                if (response.status === 401) {
                    setIsAuthenticated(false);
                    throw new Error('Sesión expirada o contraseña inválida.');
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
    };

    // Exponer métodos al padre
    useImperativeHandle(ref, () => ({
        handleQuickQuestion: (question) => {
            if (!isAuthenticated) {
                // 1. Scroll al contenedor
                if (containerRef.current) {
                    containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                // 2. Focus en el input de contraseña
                if (passwordInputRef.current) {
                    passwordInputRef.current.focus();
                }
                // 3. Mostrar mensaje informativo
                setAuthError("Para hacer esta pregunta, primero desbloquea el chat.");
                return;
            }
            // Si está autenticado, enviar mensaje
            sendMessage(question);
        }
    }));

    // Manejar el envío de contraseña
    const handleAuthSubmit = async (e) => {
        e.preventDefault();
        if (!passwordInput.trim() || verifying) return;

        setVerifying(true);
        setAuthError(null);

        try {
            const response = await fetch(`${API_BASE_URL}/api/verify-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: passwordInput })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setIsAuthenticated(true);
            } else {
                throw new Error(data.error || 'Contraseña incorrecta');
            }
        } catch (err) {
            console.error(err);
            setAuthError('Contraseña incorrecta. Inténtalo de nuevo.');
        } finally {
            setVerifying(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        sendMessage(inputUsuario);
    };

    return (
        <div style={styles.chatbotContainer} ref={containerRef}>
            {/* Pantalla de Bloqueo */}
            {!isAuthenticated && (
                <div style={styles.lockScreen}>
                    <h3 style={styles.lockTitle}>🔒 Chatbot Protegido</h3>
                    <p className="text-white mb-4 text-center text-sm">
                        Introduce la contraseña para acceder al asistente.
                    </p>
                    <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                        <input
                            ref={passwordInputRef}
                            type="password"
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            placeholder="Contraseña..."
                            style={styles.lockInput}
                            autoFocus
                        />
                        <button 
                            type="submit" 
                            style={{...styles.button, ...(verifying ? styles.buttonDisabled : {})}} 
                            disabled={verifying}
                        >
                            {verifying ? 'Verificando...' : 'Desbloquear'}
                        </button>
                    </form>
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
                    disabled={cargando || !isAuthenticated}
                />
                <button 
                    type="submit" 
                    style={{...styles.button, ...(cargando || !isAuthenticated ? styles.buttonDisabled : {})}} 
                    disabled={cargando || !isAuthenticated}
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
