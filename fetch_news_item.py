import os
import subprocess
import time
from pymongo import MongoClient, errors as pymongo_errors
from bson import ObjectId
from dotenv import load_dotenv
import json

OUTPUT_FILENAME = "retrieved_news_item.txt"

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
        client.admin.command('ping')
        db = client.get_default_database()

        news_item = None
        target_object_id = ObjectId(article_id_str)
        query = {"_id": target_object_id}
        print(f"Attempting to fetch article with ID: {article_id_str}")

        for name in collection_names_to_try:
            if name in db.list_collection_names():
                collection_to_use = db[name]
                print(f"Using collection: {name}")
                news_item = collection_to_use.find_one(query)
                if news_item:
                    print(f"Found news item with ID: {news_item.get('_id')}")
                    break

        if not news_item:
            print(f"Error: Article with ID {article_id_str} not found in specified collections.")
            client.close()
            return None

        if '_id' in news_item and isinstance(news_item['_id'], ObjectId):
            news_item['_id'] = str(news_item['_id'])

        with open(OUTPUT_FILENAME, "w", encoding="utf-8") as f:
            json.dump(news_item, f, ensure_ascii=False, indent=4)
        print(f"News item saved to {OUTPUT_FILENAME}")
        return news_item

    except pymongo_errors.ServerSelectionTimeoutError as e:
        print(f"MongoDB Connection Error: {e}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred in get_specific_news_item: {e}")
        return None
    finally:
        if 'client' in locals() and client:
            client.close()

def get_news_item_with_score(exclude_ids_str_list=None, collection_names_to_try=["noticias", "Noticias"]):
    """
    Connects to MongoDB, fetches a news item that meets criteria (puntuacion not null),
    optionally excluding a list of specific IDs, and saves it to a text file.
    Args:
        exclude_ids_str_list (list of str, optional): IDs to exclude.
        collection_names_to_try (list of str): Collection names to search.
    Returns:
        dict: The fetched news item (with _id as string) or None if not found/error.
    """
    load_dotenv()
    mongodb_uri = os.getenv("MONGODB_URI")
    if not mongodb_uri:
        print("Error: MONGODB_URI not found in .env file."); return None
    try:
        client = MongoClient(mongodb_uri, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        db = client.get_default_database()
        news_item = None; collection_to_use = None

        # Default query: puntuacion is not null.
        # Can be expanded to include 'fuente' or other fields if desired for general use.
        query = {"puntuacion": {"$ne": None}}
        print(f"Base query for get_news_item_with_score: {query}")

        if exclude_ids_str_list and isinstance(exclude_ids_str_list, list) and len(exclude_ids_str_list) > 0:
            exclude_object_ids = []
            for id_str in exclude_ids_str_list:
                try: exclude_object_ids.append(ObjectId(id_str))
                except Exception as e: print(f"Warning: Could not convert id '{id_str}' to ObjectId: {e}.")
            if exclude_object_ids: query["_id"] = {"$nin": exclude_object_ids}
            print(f"Excluding IDs: {', '.join(exclude_ids_str_list)}")

        for name in collection_names_to_try:
            if name in db.list_collection_names():
                collection_to_use = db[name]
                print(f"Using collection: {name}")
                news_item = collection_to_use.find_one(query)
                if news_item: print(f"Found news item with ID: {news_item.get('_id')}"); break

        if collection_to_use is None: print(f"Error: Collections not found."); client.close(); return None

        if news_item:
            if '_id' in news_item and isinstance(news_item['_id'], ObjectId): news_item['_id'] = str(news_item['_id'])
            with open(OUTPUT_FILENAME, "w", encoding="utf-8") as f: json.dump(news_item, f, ensure_ascii=False, indent=4)
            print(f"News item saved to {OUTPUT_FILENAME}"); return news_item
        else: print(f"No news item found matching criteria (Query: {query})."); client.close(); return None
    except Exception as e: print(f"Error in get_news_item_with_score: {e}"); return None
    finally:
        if 'client' in locals() and client: client.close()

# run_command function is not needed if __main__ only fetches data.
# It was part of the automated multi-article processing loop.
# def run_command(command_list): ...

if __name__ == "__main__":
    # Generic behavior: fetch one news item with non-null puntuacion, excluding none.
    # This makes the script reusable for just fetching a sample item.
    # The full pipeline (render, compile, send) should be orchestrated by a separate script or workflow.
    print("Running fetch_news_item.py directly to fetch a sample news item.")
    news_item = get_news_item_with_score()

    if news_item:
        print(f"Successfully fetched and saved a news item to {OUTPUT_FILENAME}.")
    else:
        print(f"Could not fetch a news item when running {__file__} directly with default criteria.")
