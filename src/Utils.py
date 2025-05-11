import hashlib


class Utils:
    # Función para codificar la URL en sha256
    @staticmethod
    def codificar_url_sha256(url):
        return hashlib.sha256(url.encode('utf-8')).hexdigest()