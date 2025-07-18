from pymongo import MongoClient
# Quiero importar load_dotenv desde el archivo .env
from dotenv import load_dotenv
import os
from pymongo.server_api import ServerApi


class MongoDBService:
    """
    Clase para manejar la conexión a MongoDB.
    Permite múltiples instancias para diferentes bases de datos.
    """
    def __init__(self, uri, db_name="mydatabase"):
        self.client = MongoClient(uri)
        self.db = self.client[db_name]

    def get_collection(self, name):
        return self.db[name]

    def close(self):
        self.client.close()
