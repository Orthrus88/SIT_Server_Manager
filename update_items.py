import requests
import json

def fetch_all_items():
    try:
        api_url = "https://db.sp-tarkov.com/api/item/names"
        response = requests.get(api_url)
        if response.status_code == 200:
            data = response.json()
            # Assuming 'data' is a list of items with their 'tpl_id' and 'Name'
            with open('items_data.json', 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
            print("Data successfully saved.")
        else:
            print(f"Failed to fetch items: HTTP {response.status_code}")
    except Exception as e:
        print(f"Error fetching items: {e}")

fetch_all_items()