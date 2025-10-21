import os
import subprocess
import time
from pymongo import MongoClient, errors as pymongo_errors
from bson import ObjectId
from dotenv import load_dotenv
import json
import random
import sys
import re

load_dotenv()

OUTPUT_FILENAME = "output_temporal/retrieved_news_item.txt"

def safe_filename(s, maxlen=60):
    s = re.sub(r'[^\w\- ]', '', s)
    s = s.replace(' ', '_')
    return s[:maxlen]

def convert_objectids_to_str(obj):
    if isinstance(obj, dict):
        return {k: convert_objectids_to_str(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_objectids_to_str(v) for v in obj]
    elif isinstance(obj, ObjectId):
        return str(obj)
    else:
        return obj

def fetch_news_item(noticia_id):
    mongodb_uri = os.getenv("NEW_MONGODB_URI")
    if not mongodb_uri:
        print("Error: NEW_MONGODB_URI not found in .env file.")
        return None
    client = MongoClient(mongodb_uri, serverSelectionTimeoutMS=5000)
    db = client['Base_de_datos_noticias']
    col = db['Noticias']
    noticia = col.find_one({'_id': ObjectId(noticia_id)})
    if noticia:
        noticia = convert_objectids_to_str(noticia)
        return noticia
    else:
        print("No news item was fetched with the default criteria.")
        return None

def get_specific_news_item(article_id_str, collection_names_to_try=["noticias", "Noticias"]):
    """
    Connects to MongoDB and fetches a specific news item by its ID.
    Saves it to a text file.
    Args:
        article_id_str (str): The string representation of the MongoDB ObjectId to fetch.
        collection_names_to_try (list of str): Collection names to search.
    Returns:
        dict: The fetched news item (with _id as string) or None if not found/error.
    """
    load_dotenv()
    mongodb_uri = os.getenv("MONGODB_URI")
    if not mongodb_uri:
        print("Error: MONGODB_URI not found in .env file.")
        return None
    try:
        client = MongoClient(mongodb_uri, serverSelectionTimeoutMS=5000)
        client.admin.command('ping'); db = client.get_default_database()
        news_item = None; target_object_id = ObjectId(article_id_str)
        query = {"_id": target_object_id}; print(f"Attempting to fetch by ID: {article_id_str}")
        for name in collection_names_to_try:
            if name in db.list_collection_names():
                collection_to_use = db[name]; print(f"Using collection: {name}")
                news_item = collection_to_use.find_one(query)
                if news_item: print(f"Found: {news_item.get('_id')}"); break
        if not news_item: print(f"ID {article_id_str} not found."); client.close(); return None
        if '_id' in news_item and isinstance(news_item['_id'], ObjectId): news_item['_id'] = str(news_item['_id'])
        # Guardar en hemingwai/output_temporal/retrieved_news_item.txt
        output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output_temporal/retrieved_news_item.txt')
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(news_item, f, ensure_ascii=False, indent=4)
        print(f"Saved to {output_path}"); return news_item
    except Exception as e: print(f"Error in get_specific_news_item: {e}"); return None
    finally:
        if 'client' in locals() and client: client.close()

def get_news_item_by_url(url_str, collection_names_to_try=["noticias", "Noticias"]):
    """
    Connects to MongoDB and fetches a specific news item by its URL.
    Saves it to a text file.
    """
    load_dotenv()
    mongodb_uri = os.getenv("MONGODB_URI")
    if not mongodb_uri: print("Error: MONGODB_URI not found."); return None
    try:
        client = MongoClient(mongodb_uri, serverSelectionTimeoutMS=5000)
        client.admin.command('ping'); db = client.get_default_database()
        news_item = None; query = {"url": url_str}
        print(f"Attempting to fetch article with URL: {url_str}")
        for name in collection_names_to_try:
            if name in db.list_collection_names():
                collection_to_use = db[name]; print(f"Using collection: {name}")
                news_item = collection_to_use.find_one(query)
                if news_item: print(f"Found: {news_item.get('_id')}"); break
        if not news_item: print(f"URL {url_str} not found."); client.close(); return None
        if '_id' in news_item and isinstance(news_item['_id'], ObjectId): news_item['_id'] = str(news_item['_id'])
        with open(OUTPUT_FILENAME, "w", encoding="utf-8") as f: json.dump(news_item, f, ensure_ascii=False, indent=4)
        print(f"Saved to {OUTPUT_FILENAME}"); return news_item
    except Exception as e: print(f"Error in get_news_item_by_url: {e}"); return None
    finally:
        if 'client' in locals() and client: client.close()

def get_news_item_with_score(exclude_ids_str_list=None, collection_names_to_try=["noticias", "Noticias"], require_fuente=False):
    """
    Connects to MongoDB, fetches a news item that meets criteria (puntuacion not null, optionally fuente not null),
    optionally excluding a list of specific IDs, and saves it to a text file.
    """
    load_dotenv()
    mongodb_uri = os.getenv("MONGODB_URI")
    if not mongodb_uri: print("Error: MONGODB_URI not found."); return None
    try:
        client = MongoClient(mongodb_uri, serverSelectionTimeoutMS=5000)
        client.admin.command('ping'); db = client.get_default_database()
        news_item = None; collection_to_use = None

        query = {"puntuacion": {"$ne": None}}
        if require_fuente:
            query["fuente"] = {"$ne": None}
        print(f"Base query for get_news_item_with_score: {query}")

        if exclude_ids_str_list and isinstance(exclude_ids_str_list, list) and len(exclude_ids_str_list) > 0:
            exclude_object_ids = []
            for id_str in exclude_ids_str_list:
                try: exclude_object_ids.append(ObjectId(id_str))
                except Exception as e: print(f"Warning: Could not convert id '{id_str}' to ObjectId: {e}.")
            if exclude_object_ids: query["_id"] = {"$nin": exclude_object_ids}
            print(f"Excluding IDs: {', '.join(exclude_ids_str_list)}")

        for name in collection_names_to_try:
            collection_to_use = db.get_collection(name) # Simplified collection access
            if collection_to_use is not None : print(f"Using collection: {name}") # Check if collection exists
            # Obtener todos los documentos que cumplen el criterio
            docs = list(collection_to_use.find(query))
            if docs:
                news_item = random.choice(docs)
                print(f"Found news item with ID: {news_item.get('_id')}"); break

        if collection_to_use is None: print(f"Error: None of the specified collections were found."); client.close(); return None # Should not happen if list_collection_names was checked before

        if news_item:
            if '_id' in news_item and isinstance(news_item['_id'], ObjectId): news_item['_id'] = str(news_item['_id'])
            with open(OUTPUT_FILENAME, "w", encoding="utf-8") as f: json.dump(news_item, f, ensure_ascii=False, indent=4)
            print(f"News item saved to {OUTPUT_FILENAME}"); return news_item
        else: print(f"No news item found matching criteria (Query: {query})."); client.close(); return None
    except Exception as e: print(f"Error in get_news_item_with_score: {e}"); return None
    finally:
        if 'client' in locals() and client: client.close()

# Main execution block reverted to a generic example
if __name__ == "__main__":
    print("Running fetch_news_item.py directly as a standalone script.")
    if len(sys.argv) > 1:
        article_id = sys.argv[1]
        print(f"Fetching by id: {article_id}")
        retrieved_item = fetch_news_item(article_id)
        if retrieved_item:
            output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'retrieved_news_item.txt')
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(retrieved_item, f, ensure_ascii=False, indent=4)
            print(f"Saved to {output_path}")
    else:
        print(f"This will attempt to fetch one news item with 'puntuacion' not null and save it to output_temporal.")
        retrieved_item = get_news_item_with_score()

    if retrieved_item:
        print("\nSample fetched item data:")
        for key, value in retrieved_item.items():
            if isinstance(value, list) or isinstance(value, dict):
                print(f"  {key}: [complex type - not showing full content]")
            elif isinstance(value, str) and len(value) > 100:
                print(f"  {key}: {value[:100]}...")
            else:
                print(f"  {key}: {value}")
    else:
        print("No news item was fetched with the default criteria.")

    # Note: The PDF generation pipeline (render_latex.py, pdflatex, send_telegram_pdf.py)
    # is NOT automatically run when this script is executed directly in this generic state.
    # It's intended to be orchestrated by another script or a controller like Jules.
    # The run_command function has been removed as it was part of the automated multi-article processing loop.
