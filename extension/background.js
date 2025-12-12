// HemingwAI Extension - Background Service Worker

const API_BASE = "https://hemingwai-backend-5vw6.onrender.com";

// In-memory auth state
let isUnlocked = false;
let passwordCache = null;
const newsContextCache = new Map(); // cache by URL

// Helper to make API calls
async function callApi(path, options = {}) {
    try {
        const url = `${API_BASE}${path}`;
        const response = await fetch(url, options);
        
        // Return response object to let caller handle status
        return response;
    } catch (error) {
        console.error(`[HemingwAI Background] API Error calling ${path}:`, error);
        throw error;
    }
}

// Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        try {
            switch (message.type) {
                case "CHECK_AUTH_STATUS": {
                    sendResponse({ isUnlocked });
                    break;
                }

                case "VERIFY_PASSWORD": {
                    const { password } = message;
                    if (!password) {
                        sendResponse({ ok: false, error: "Introduce la contraseña." });
                        return;
                    }

                    try {
                        const response = await callApi("/api/chat/validate-password", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ password })
                        });

                        const data = await response.json();

                        if (response.ok && data.ok) {
                            isUnlocked = true;
                            passwordCache = password;
                            sendResponse({ ok: true });
                        } else {
                            // Reset state on failure
                            isUnlocked = false;
                            passwordCache = null;
                            const errorMsg = data.error === "invalid_password" ? "Contraseña incorrecta." : (data.error || "Error de validación.");
                            sendResponse({ ok: false, error: errorMsg });
                        }
                    } catch (err) {
                        sendResponse({ ok: false, error: "Error de conexión con el servidor." });
                    }
                    break;
                }

                case "NEWS_CONTEXT_REQUEST": {
                    const { url } = message;
                    if (!url) {
                        sendResponse({ ok: false, error: "URL no proporcionada." });
                        return;
                    }

                    // Check cache first
                    if (newsContextCache.has(url)) {
                        sendResponse({ ok: true, news: newsContextCache.get(url) });
                        return;
                    }

                    try {
                        const encodedUrl = encodeURIComponent(url);
                        const response = await callApi(`/api/news/context?url=${encodedUrl}`);
                        
                        if (response.ok) {
                            const data = await response.json();
                            if (data.ok && data.news) {
                                newsContextCache.set(url, data.news);
                                sendResponse({ ok: true, news: data.news });
                            } else {
                                sendResponse({ ok: false, error: data.error || "No se encontró contexto para esta noticia." });
                            }
                        } else {
                            const data = await response.json().catch(() => ({}));
                            sendResponse({ ok: false, error: data.error || "No se encontró contexto para esta noticia." });
                        }
                    } catch (err) {
                        sendResponse({ ok: false, error: "Error de conexión al obtener contexto." });
                    }
                    break;
                }

                case "NEWS_CHAT_MESSAGE": {
                    const { newsId, userMessage, previousMessages } = message;

                    if (!isUnlocked || !passwordCache) {
                        sendResponse({ ok: false, error: "AUTH_REQUIRED" });
                        return;
                    }

                    if (!newsId || !userMessage) {
                        sendResponse({ ok: false, error: "Faltan parámetros para el chat." });
                        return;
                    }

                    try {
                        const response = await callApi("/api/chat/news", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                newsId,
                                userMessage,
                                previousMessages: previousMessages || [],
                                password: passwordCache
                            })
                        });

                        if (response.status === 401) {
                            isUnlocked = false;
                            passwordCache = null;
                            sendResponse({ ok: false, error: "AUTH_REQUIRED" });
                            return;
                        }

                        const data = await response.json();

                        if (response.ok && data.ok) {
                            sendResponse({ ok: true, assistantMessage: data.assistantMessage });
                        } else {
                            sendResponse({ ok: false, error: data.error || "Error al obtener respuesta del chatbot." });
                        }
                    } catch (err) {
                        sendResponse({ ok: false, error: "Error de conexión con el chatbot." });
                    }
                    break;
                }

                default:
                    // Unknown message type
                    break;
            }
        } catch (globalErr) {
            console.error("[HemingwAI Background] Global handler error:", globalErr);
            sendResponse({ ok: false, error: "Error interno en la extensión." });
        }
    })();
    
    // Return true to indicate we will respond asynchronously
    return true;
});
