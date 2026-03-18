// HemingwAI Extension - Background Service Worker

const API_BASES = {
    prod: "https://hemingwai-backend.onrender.com",
    dev: "https://hemingwai-backend-5vw6.onrender.com"
};

const REQUEST_TIMEOUT_MS = 12000;

let currentEnv = "prod";
let isUnlocked = false;
let passwordCache = null;
const newsContextCache = new Map(); // cache key: `${env}:${url}`

function storageGet(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => resolve(result || {}));
    });
}

async function loadEnvironmentFromStorage() {
    try {
        const result = await storageGet(["hemingwaiEnv"]);
        currentEnv = result.hemingwaiEnv === "dev" ? "dev" : "prod";
    } catch (error) {
        currentEnv = "prod";
    }
    return currentEnv;
}

function resetSessionState() {
    isUnlocked = false;
    passwordCache = null;
    newsContextCache.clear();
}

function getApiBase() {
    return API_BASES[currentEnv] || API_BASES.prod;
}

async function parseJsonSafely(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

async function callApi(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);

    try {
        const url = `${getApiBase()}${path}`;
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        const data = await parseJsonSafely(response);
        return {
            ok: response.ok,
            status: response.status,
            data
        };
    } catch (error) {
        if (error?.name === "AbortError") {
            throw new Error(`TIMEOUT:${path}`);
        }
        console.error(`[HemingwAI Background] API error calling ${path}:`, error);
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

function getConnectionErrorMessage(error, fallback) {
    if (String(error?.message || "").startsWith("TIMEOUT:")) {
        return "Tiempo de espera agotado al contactar con el backend.";
    }
    return fallback;
}

async function handleVerifyPassword(message) {
    const { password } = message;
    if (!password) {
        return { ok: false, error: "Introduce la contraseña." };
    }

    try {
        const response = await callApi("/api/chat/validate-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password })
        });

        if (response.ok && response.data?.ok) {
            isUnlocked = true;
            passwordCache = password;
            return { ok: true };
        }

        resetSessionState();
        const errorMsg = response.data?.error === "invalid_password"
            ? "Contraseña incorrecta."
            : (response.data?.error || "Error de validación.");
        return { ok: false, error: errorMsg };
    } catch (error) {
        return { ok: false, error: getConnectionErrorMessage(error, "Error de conexión con el servidor.") };
    }
}

async function handleNewsContextRequest(message) {
    const { url } = message;
    if (!url) {
        return { ok: false, error: "URL no proporcionada." };
    }

    const cacheKey = `${currentEnv}:${url}`;
    if (newsContextCache.has(cacheKey)) {
        return { ok: true, news: newsContextCache.get(cacheKey) };
    }

    try {
        const encodedUrl = encodeURIComponent(url);
        const response = await callApi(`/api/news/context?url=${encodedUrl}`);

        if (response.ok && response.data?.ok && response.data?.news) {
            newsContextCache.set(cacheKey, response.data.news);
            return { ok: true, news: response.data.news };
        }

        return {
            ok: false,
            error: response.data?.error || "No se encontró contexto para esta noticia."
        };
    } catch (error) {
        return {
            ok: false,
            error: getConnectionErrorMessage(error, "Error de conexión al obtener contexto.")
        };
    }
}

async function handleNewsChatMessage(message) {
    const { newsId, userMessage, previousMessages } = message;

    if (!isUnlocked || !passwordCache) {
        return { ok: false, error: "AUTH_REQUIRED" };
    }

    if (!newsId || !userMessage) {
        return { ok: false, error: "Faltan parámetros para el chat." };
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
            resetSessionState();
            return { ok: false, error: "AUTH_REQUIRED" };
        }

        if (response.ok && response.data?.ok) {
            return { ok: true, assistantMessage: response.data.assistantMessage };
        }

        return {
            ok: false,
            error: response.data?.error || "Error al obtener respuesta del chatbot."
        };
    } catch (error) {
        return {
            ok: false,
            error: getConnectionErrorMessage(error, "Error de conexión con el chatbot.")
        };
    }
}

async function handleCheckUrlsBatch(message) {
    const urls = Array.isArray(message?.urls)
        ? message.urls.filter((url) => typeof url === "string" && url.trim())
        : [];

    if (urls.length === 0) {
        return { ok: false, error: "No se proporcionaron URLs válidas.", resultados: [] };
    }

    try {
        const response = await callApi("/api/check-urls", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urls })
        });

        if (!response.ok) {
            return {
                ok: false,
                error: response.data?.error || "El backend no pudo procesar la consulta.",
                resultados: []
            };
        }

        if (!response.data || !Array.isArray(response.data.resultados)) {
            return {
                ok: false,
                error: "Respuesta inválida del backend para check-urls.",
                resultados: []
            };
        }

        return {
            ok: true,
            resultados: response.data.resultados
        };
    } catch (error) {
        return {
            ok: false,
            error: getConnectionErrorMessage(error, "Error de conexión al comprobar URLs."),
            resultados: []
        };
    }
}

const MESSAGE_HANDLERS = {
    CHECK_AUTH_STATUS: async () => ({ isUnlocked }),
    VERIFY_PASSWORD: handleVerifyPassword,
    NEWS_CONTEXT_REQUEST: handleNewsContextRequest,
    NEWS_CHAT_MESSAGE: handleNewsChatMessage,
    CHECK_URLS_BATCH: handleCheckUrlsBatch
};

loadEnvironmentFromStorage();

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.hemingwaiEnv) {
        return;
    }

    const nextEnv = changes.hemingwaiEnv.newValue === "dev" ? "dev" : "prod";
    if (nextEnv !== currentEnv) {
        currentEnv = nextEnv;
        resetSessionState();
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        try {
            await loadEnvironmentFromStorage();

            const handler = MESSAGE_HANDLERS[message?.type];
            if (!handler) {
                sendResponse({ ok: false, error: `Unknown message type: ${message?.type || "undefined"}` });
                return;
            }

            const result = await handler(message, sender);
            sendResponse(result);
        } catch (error) {
            console.error("[HemingwAI Background] Global handler error:", error);
            sendResponse({ ok: false, error: "Error interno en la extensión." });
        }
    })();

    return true;
});
