from pymongo import MongoClient
# Quiero importar load_dotenv desde el archivo .env
from dotenv import load_dotenv
import os
from pymongo.server_api import ServerApi


class MongoDBService:
    _instance = None
    
    """
    Clase Singleton para manejar la conexión a MongoDB.
    Se utiliza para evitar múltiples conexiones a la base de datos.
    """
    def __new__(cls, uri, db_name="mydatabase"):
        if cls._instance is None:
            cls._instance = super(MongoDBService, cls).__new__(cls)
            cls._instance._setup(uri, db_name)
        return cls._instance

    def _setup(self, uri, db_name):
        self.client = MongoClient(uri)
        self.db = self.client[db_name]

    def get_collection(self, name):
        return self.db[name]

    def close(self):
        self.client.close()
        MongoDBService._instance = None  # Permitir nueva instancia si se cierra
