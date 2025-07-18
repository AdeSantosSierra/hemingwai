from hemingwai.src.Utils import Utils
import openai
import os
from pymongo import MongoClient

def main():
    new_mongo_uri = os.getenv('NEW_MONGODB_URI')
    openai.api_key = os.getenv('OPENAI_API_KEY')
    if not new_mongo_uri or not openai.api_key:
        print('Faltan variables de entorno NEW_MONGODB_URI u OPENAI_API_KEY.')
        return
    # Leer y escribir en la base de datos nueva
    client = MongoClient(new_mongo_uri)
    col = client['Base_de_datos_noticias']['Noticias']
    noticias = col.find({'embedding': {'$exists': True, '$ne': None}})
    for noticia in noticias:
        print(f"\nProcesando noticia ID: {noticia['_id']}")
        Utils.pipeline_fake_news_por_id(
            noticia_id=noticia['_id'],
            openai_client=openai,
            read_mongo_uri=new_mongo_uri,
            write_mongo_uri=new_mongo_uri
        )

if __name__ == '__main__':
    main() 