import os
import json
from flask import jsonify, render_template, request

# Global variable to store items data
items_data = {}

def load_item_data():
    try:
        with open('items/items_data.json', 'r', encoding='utf-8') as file:
            items_list = json.load(file)
            global items_data
            items_data = {item['item']['_id']: item['locale']['Name'] for item in items_list}
        print("Loaded items data:", list(items_data.items())[:5])  # Print first 5 items for checking
    except Exception as e:
        print(f"Error loading item data: {e}")

def get_item_names():
    tpl_ids = request.json.get('tpl_ids', [])
    item_names = [items_data.get(tpl_id, "Unknown") for tpl_id in tpl_ids]
    return jsonify({"itemNames": item_names})

def pmc():
    folder_path = os.path.join('user', 'profiles')
    pmc_info = []

    for filename in os.listdir(folder_path):
        if filename.endswith('.json'):
            file_path = os.path.join(folder_path, filename)
            with open(file_path, 'r', encoding='utf-8') as file:
                data = json.load(file)
                pmc_data = data.get("characters", {}).get("pmc", {})
                info = pmc_data.get("Info", {})
                inventory = pmc_data.get("Inventory", {})
                equipment_id = inventory.get("equipment", "")

                equipment_tpl_ids = [item['_tpl'] for item in inventory.get('items', []) if item.get('parentId') == equipment_id]

                pmc_info.append({
                    "filename": filename,
                    "nickname": info.get("LowerNickname", "Unknown"),
                    "level": info.get("Level", "Unknown"),
                    "side": info.get("Side", "Unknown"),
                    "equipment_tpl_ids": equipment_tpl_ids
                })
    return render_template('pmc.html', pmc_info=pmc_info)

def delete_profile(filename):
    file_path = os.path.join('user', 'profiles', filename)
    absolute_path = os.path.abspath(file_path)  # Get the absolute path for debugging

    print(f"Trying to delete: {absolute_path}")
    print(f"Current working directory: {os.getcwd()}")

    if os.path.exists(absolute_path):
        try:
            os.remove(absolute_path)
            print(f"File {absolute_path} deleted successfully.")
            return True
        except Exception as e:
            print(f"Error deleting file: {e}")
    else:
        print(f"File {absolute_path} not found.")

    return False