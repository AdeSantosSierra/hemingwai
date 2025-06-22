import os
import requests
from dotenv import load_dotenv

def send_pdf_via_telegram(pdf_filepath, caption=""):
    """
    Sends a PDF file to a Telegram chat using a bot.

    Args:
        pdf_filepath (str): The path to the PDF file to send.
        caption (str, optional): Caption for the PDF. Defaults to "".
    """
    load_dotenv()
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")

    if not bot_token:
        print("Error: TELEGRAM_BOT_TOKEN not found in .env file.")
        return False
    if not chat_id:
        print("Error: TELEGRAM_CHAT_ID not found in .env file.")
        return False

    if not os.path.exists(pdf_filepath):
        print(f"Error: PDF file '{pdf_filepath}' not found.")
        return False

    url = f"https://api.telegram.org/bot{bot_token}/sendDocument"

    files = {'document': open(pdf_filepath, 'rb')}
    data = {'chat_id': chat_id}
    if caption:
        data['caption'] = caption

    try:
        print(f"Sending '{pdf_filepath}' to chat ID {chat_id}...")
        response = requests.post(url, files=files, data=data, timeout=30)
        response.raise_for_status()  # Raise an exception for HTTP errors (4xx or 5xx)

        if response.json().get("ok"):
            print("PDF sent successfully via Telegram!")
            return True
        else:
            print(f"Telegram API Error: {response.json().get('description')}")
            print(f"Response content: {response.text}")
            return False

    except requests.exceptions.Timeout:
        print("Error: Request to Telegram API timed out.")
        return False
    except requests.exceptions.RequestException as e:
        print(f"Error sending PDF via Telegram: {e}")
        print(f"Response content: {e.response.text if e.response else 'No response'}")
        return False
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return False
    finally:
        if 'document' in files and files['document']:
            files['document'].close()


if __name__ == "__main__":
    pdf_to_send = "news_report.pdf"
    news_title = "Noticia Reciente" # Default title

    # Try to get the title from the .tex file or the original data for a better caption
    try:
        import json
        with open("retrieved_news_item.txt", "r", encoding="utf-8") as f:
            news_data = json.load(f)
            news_title = news_data.get("titulo", news_title)
    except Exception:
        pass # Silently ignore if we can't get the title easily

    if send_pdf_via_telegram(pdf_to_send, caption=f"Reporte de Noticia: {news_title}"):
        print("Script finished successfully.")
    else:
        print("Script failed to send PDF.")
        exit(1)
