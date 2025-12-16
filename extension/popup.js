document.addEventListener('DOMContentLoaded', async () => {
    const label = document.getElementById('current-env');
    const btnProd = document.getElementById('btn-prod');
    const btnDev = document.getElementById('btn-dev');
    const btnReload = document.getElementById('btn-reload');

    // Función para obtener entorno actual
    async function getCurrentEnv() {
        return new Promise((resolve) => {
            chrome.storage.local.get("hemingwaiEnv", (result) => {
                resolve(result.hemingwaiEnv || "prod");
            });
        });
    }

    // Función para guardar entorno
    async function setEnv(env) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ hemingwaiEnv: env }, () => {
                resolve();
            });
        });
    }

    // Renderizar UI
    function render(env) {
        if (env === 'dev') {
            label.textContent = "DEV";
            label.className = "env-dev";
            btnDev.classList.add('active');
            btnProd.classList.remove('active');
        } else {
            label.textContent = "PROD";
            label.className = "env-prod";
            btnProd.classList.add('active');
            btnDev.classList.remove('active');
        }
    }

    // Inicializar
    const currentEnv = await getCurrentEnv();
    render(currentEnv);

    // Handlers
    btnProd.addEventListener('click', async () => {
        await setEnv('prod');
        render('prod');
    });

    btnDev.addEventListener('click', async () => {
        await setEnv('dev');
        render('dev');
    });

    btnReload.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab) {
                chrome.tabs.reload(tab.id);
                // Cerrar popup opcionalmente, pero a veces es mejor dejar que el usuario vea que recarga
                window.close();
            }
        });
    });
});
