import re
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
from newspaper import Article
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
import hashlib
import os
from dotenv import load_dotenv
from MongoDB import *
from Utils import *



class Periodico:
    def __init__(self, nombre, url):
        load_dotenv()
        self.nombre = nombre
        self.url = url
        mongodb_uri = os.getenv('MONGODB_URI')
        self.db = MongoDBService(uri=mongodb_uri, db_name='Base_de_datos_noticias')

    def extraer_noticia(self, url) -> dict:
        """
        Extrae el contenido de una noticia a partir de su URL.
        :param url: URL de la noticia.
        :return: Un diccionario con el título, cuerpo, fecha de publicación y autor de la noticia.
        """ 
        try:
            articulo = Article(url)
            articulo.download()
            articulo.parse()
            noticia = {
                "url": url,
                "titulo": articulo.title.strip() if articulo.title else "Sin título",
                "cuerpo": articulo.text.strip() if articulo.text else "Sin contenido",
                "fecha_publicacion": articulo.publish_date.isoformat() if articulo.publish_date else None,
                "autor": articulo.authors,
                "identificador": Utils.codificar_url_sha256(url),  # Se añade el hash de la URL
                "fuente": self.nombre,
                "fecha_extraccion": Utils.obtener_fecha_hora_actual_iso(),
                'tags': list(articulo.tags) if articulo.tags else [],
                'keywords': list(articulo.meta_keywords) if articulo.meta_keywords else [],
                'top_image': articulo.top_image if articulo.top_image else None,
                'images': list(articulo.images) if articulo.images else [],
                'is_media_news': articulo.is_media_news(),
            }
            return noticia
        except Exception as e:
            print(f"Error al procesar la URL: {url} - {e}")
            return None

    # Función para guardar una noticia en MongoDB
    def guardar_noticia(self, noticia) -> None:
        """
        Guarda una noticia en la base de datos MongoDB.
        :param noticia: Un diccionario con la noticia a guardar.
        """
        collection = self.db.get_collection('Noticias')
        try:
            if noticia and noticia['cuerpo']:
                if not collection.find_one({"url": noticia['url']}):  # Evitar duplicados
                    collection.insert_one(noticia)
                    # print(f"Noticia guardada con éxito: {noticia['titulo']}")
                # else:
                    # print(f"La noticia ya existe en la base de datos: {noticia['url']}")
            # else:
                # print("Noticia vacía o incompleta. No se guarda.")
        except Exception as e:
            print(f"Error al guardar la noticia en MongoDB: {e}")

    # Función para filtrar enlaces que parecen ser noticias y descartar los que no lo son
    def filtrar_enlaces_noticias(self, enlaces) -> set:
        """
        Filtra los enlaces para encontrar aquellos que parecen ser noticias.
        :param enlaces: Un conjunto de enlaces a filtrar.
        :return: Un conjunto de enlaces que parecen ser noticias.
        """
        patrones_noticias = [
            r'/noticia/',  # patrón simple
            r'/noticias/',  # patrón simple
            r'/espana/',  # patrón simple
            r'/internacional/',  # patrón simple
            r'/news/',  # patrón simple
            r'\d{4}/\d{2}/\d{2}/',  # fechas tipo 2024/04/08/
            r'\d{4}-\d{2}-\d{2}/',  # fechas tipo 2024-04-08/
            r'\d{2}/\d{2}/\d{4}/',  # fechas tipo 20/04/2024
            r'\d{2}-\d{2}-\d{4}/',  # fechas tipo 20-04-2024
            r'/\d{4}/[a-z]{3}/\d{2}/[\w\-]+',     # tipo /2025/abr/18/titulo-noticia
            r'/articulo/',  # patrón simple
            r'/articulos/',  # patrón simple
            r'/article/',  # patrón simple
            r'/[\w\-]*news[\w\-]*/\d{4}/\d{2}/\d{2}/[\w\-]+',   # con "news" en el path antes de la fecha
            r'/[\w\-]*noticia[\w\-]*/\d{4}/\d{2}/\d{2}/[\w\-]+', # con "noticia" y fecha
        ]
        patrones_descartar = [
            r'/opinion/', r'/columna/', r'/editorial/', r'/cronica/', r'/ensayo/', r'/entrevista/',
            r'/analisis/', r'/review/', r'/reseña/', r'/blog/', r'/comentario/', r'/debate/', r'/podcast/',
            r'/especial/', r'/reportaje/', r'/investigacion/', r'/suplemento/', r'/revista/', r'/magazine/',
            r'/humor/', r'/cartas/', r'/obituario/', r'/agenda/', r'/tendencias/', r'/opinión/', r'/perspectiva/'
        ]
        enlaces_filtrados = set()
        for enlace in enlaces:
            if any(re.search(patron, enlace) for patron in patrones_noticias) and not any(
                    re.search(patron, enlace) for patron in patrones_descartar):
                enlaces_filtrados.add(enlace)
        return enlaces_filtrados
    
    # Función para extraer todas las URLs de una página principal con límite opcional
    def extraer_enlaces(self, limite=None) -> set:
        """
        Extrae todos los enlaces de una página principal.
        :param url: URL de la página principal.
        :param limite: Límite opcional de enlaces a extraer.
        :return: Un conjunto de enlaces extraídos.
        """
        try:
            response = requests.get(self.url, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'html.parser')
            enlaces = set()
            for a_tag in soup.find_all('a', href=True):
                enlace = urljoin(self.url, a_tag['href'])
                if enlace.startswith("http"):
                    enlaces.add(enlace)
                if limite and len(enlaces) >= limite:
                    break
            # print(f"Se encontraron {len(enlaces)} enlaces en la página principal (límite: {limite}).")
            return enlaces
        except Exception as e:
            print(f"Error al procesar la página principal: {self.url} - {e}")
            return set()

    # Función principal para procesar todas las noticias de un periódico
    def procesar_periodico(self, limite_enlaces=None) -> None:
        """
        Procesa todas las noticias de un periódico a partir de su URL.
        :param url_periodico: URL del periódico.
        :param limite_enlaces: Límite opcional de enlaces a extraer.
        """
        
        enlaces = self.extraer_enlaces(limite=limite_enlaces)
        
        enlaces_noticias = self.filtrar_enlaces_noticias(enlaces)
        for enlace in enlaces_noticias:
            noticia = self.extraer_noticia(enlace)
            self.guardar_noticia(noticia)




# Menú interactivo
def menu_principal():


    periodico = Periodico('BBC', 'https://www.bbc.com/')
    periodico = Periodico('ElMundo', 'https://www.elmundo.es/')
    periodico = Periodico('ElPais', 'https://elpais.com/')
    # periodico = Periodico('LaVanguardia', 'https://www.lavanguardia.com/')
    # periodico = Periodico('ElConfidencial', 'https://www.elconfidencial.com/')
    # periodico = Periodico('ElDiario', 'https://www.eldiario.es/')
    # periodico = Periodico('LaRazon', 'https://www.larazon.es/')
    # periodico = Periodico('ABC', 'https://www.abc.es/')

    # Pon todos los periódicos anteriores en un diccionario
    periodicos = {
        # 'BBC': 'https://www.bbc.com/',
        'ElMundo': 'https://www.elmundo.es/',
        'ElPais': 'https://elpais.com/',
        'LaVanguardia': 'https://www.lavanguardia.com/',
        # 'ElConfidencial': 'https://www.elconfidencial.com/',
        'ElDiario': 'https://www.eldiario.es/',
        'LaRazon': 'https://www.larazon.es/',
        'ABC': 'https://www.abc.es/'
    }

    for nombre, url in periodicos.items():
        print(f"Procesando periódico: {nombre}")
        periodico = Periodico(nombre, url)
        periodico.procesar_periodico(limite_enlaces=200)

    # print("Seleccione una opción:")
    # print("1. Extraer una noticia")
    # print("2. Extraer noticias de un sitio web")
    # opcion = input("Ingrese el número de la opción elegida: ")
    # if opcion == "1":
    #     url = input("Ingrese la URL de la noticia: ")
    #     noticia = periodico.extraer_noticia(url)
    #     print(noticia)
    #     if noticia:
    #         periodico.guardar_noticia(noticia)
    # elif opcion == "2":
    #     url_periodico = input("Ingrese la URL del sitio web: ")
    #     limitar = input("¿Desea establecer un límite de noticias? (s/n): ").strip().lower()
    #     limite = None
    #     if limitar == "s":
    #         limite = int(input("Ingrese el número máximo de noticias a extraer: "))
    #     periodico.procesar_periodico(url_periodico, limite_enlaces=limite)
    # else:
    #     print("Opción no válida. Intente nuevamente.")
# Ejecutar menú principal
if __name__ == "__main__":
    menu_principal()