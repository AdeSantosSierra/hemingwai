import os
import json
import matplotlib.pyplot as plt
import numpy as np

# Etiquetas fijas
CAMPOS_FIJOS = [
    "Interpretación del periodista", "Opiniones", "Cita de fuentes", "Confiabilidad de las fuentes",
    "Trascendencia", "Relevancia de los datos", "Precisión y claridad", "Enfoque", "Contexto", "Ética"
]

def generar_grafico_arania(valores, etiquetas, nombre_archivo):
    N = len(etiquetas)
    
    # Asegura cerrar la forma
    valores = list(valores)
    valores += valores[:1]

    # Ángulos
    angulos = np.linspace(0, 2 * np.pi, N, endpoint=False).tolist()
    angulos += angulos[:1]

    # Figura
    fig, ax = plt.subplots(figsize=(8, 8), subplot_kw=dict(polar=True))

    # Trazo principal
    ax.plot(angulos, valores, color='blue', linewidth=2, linestyle='solid', marker='o', label='Puntuación')
    ax.fill(angulos, valores, color='skyblue', alpha=0.3)

    # Eje radial
    ax.set_xticks(angulos[:-1])
    ax.set_xticklabels(etiquetas, fontsize=10)

    # Límites de radio
    ax.set_rlabel_position(30)
    ax.set_yticks([2, 4, 6, 8, 10])
    ax.set_yticklabels(['2', '4', '6', '8', '10'], fontsize=8)
    ax.set_ylim(0, 10)

    # Título
    ax.set_title("Puntuaciones Individuales", size=15, pad=20)

    # Ajusta y guarda
    plt.tight_layout()
    plt.savefig(nombre_archivo)
    plt.close()

def ensure_output_dir():
    output_dir = os.path.join(os.path.dirname(__file__), 'output_temporal')
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    return output_dir

def main():
    # Usar la ruta absoluta para retrieved_news_item.txt
    script_dir = os.path.dirname(os.path.abspath(__file__))
    news_item_path = os.path.join(script_dir, 'retrieved_news_item.txt')
    with open(news_item_path, "r", encoding="utf-8") as f:
        noticia = json.load(f)

    puntuaciones = noticia.get("puntuacion_individual", {})
    if not puntuaciones:
        print("La noticia no contiene el campo 'puntuacion_individual'.")
        return

    # Tomar valores en orden 1-10, normalizar de 0-100 a 1-10
    valores = [puntuaciones.get(str(i), 0) for i in range(1, 11)]
    valores = [1 + 9 * (float(v) / 100) for v in valores]
    if not all(isinstance(v, (int, float)) for v in valores):
        print("Algunos valores no son numéricos.")
        return

    output_dir = ensure_output_dir()
    output_file = os.path.join(output_dir, "spider_chart.png")
    generar_grafico_arania(valores, CAMPOS_FIJOS, output_file)
    print(f"Gráfico generado correctamente: {output_file}")

if __name__ == "__main__":
    main()
 