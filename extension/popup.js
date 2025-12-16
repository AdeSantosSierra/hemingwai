document.addEventListener('DOMContentLoaded', async () => {
    const label = document.getElementById('current-env');
    const btnProd = document.getElementById('btn-prod');
    const btnDev = document.getElementById('btn-dev');
    const chkDebug = document.getElementById('chk-debug');
    const debugContainer = document.getElementById('debug-container');
    const btnReload = document.getElementById('btn-reload');

    // Función para obtener configuración actual
    async function getSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(["hemingwaiEnv", "hemingwaiDebug"], (result) => {
                resolve({
                    env: result.hemingwaiEnv || "prod",
                    debug: result.hemingwaiDebug || false
                });
            });
        });
    }

    // Función para guardar configuración
    async function updateStorage(changes) {
        return new Promise((resolve) => {
            chrome.storage.local.set(changes, () => {
                resolve();
            });
        });
    }

    // Renderizar UI
    function render(settings) {
        // Render Env
        if (settings.env === 'dev') {
            label.textContent = "DEV";
            label.className = "env-dev";
            btnDev.classList.add('active');
            btnProd.classList.remove('active');
            
            // Show Debug option in DEV
            debugContainer.style.display = 'flex';
        } else {
            label.textContent = "PROD";
            label.className = "env-prod";
            btnProd.classList.add('active');
            btnDev.classList.remove('active');
            
            // Hide Debug option in PROD
            debugContainer.style.display = 'none';
        }
        
        // Render Debug
        chkDebug.checked = !!settings.debug;
    }

    // Inicializar
    const settings = await getSettings();
    render(settings);

    // Handlers
    
    // PROD Button -> Env: prod, Debug: false (Smart Default)
    btnProd.addEventListener('click', async () => {
        const newSettings = { hemingwaiEnv: 'prod', hemingwaiDebug: false };
        await updateStorage(newSettings);
        render({ env: 'prod', debug: false });
    });

    // DEV Button -> Env: dev, Debug: true (Smart Default)
    btnDev.addEventListener('click', async () => {
        const newSettings = { hemingwaiEnv: 'dev', hemingwaiDebug: true };
        await updateStorage(newSettings);
        render({ env: 'dev', debug: true });
    });

    // Debug Checkbox -> Toggle only Debug
    chkDebug.addEventListener('change', async (e) => {
        const isChecked = e.target.checked;
        await updateStorage({ hemingwaiDebug: isChecked });
        // Update local render state (preserve current env visually)
        const current = await getSettings(); // refresh to get env
        render({ env: current.env, debug: isChecked });
    });

    btnReload.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab) {
                chrome.tabs.reload(tab.id);
                // Cerrar popup opcionalmente
                window.close();
            }
        });
    });
});
