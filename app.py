# Standard library imports
import os
import subprocess
import threading
import time
import glob
import json
import requests

# Third-party imports
from flask import Flask, jsonify, redirect, render_template, url_for, request
from flask_socketio import SocketIO, emit
import psutil
from fnmatch import fnmatch

# Application setup
app = Flask(__name__)
socketio = SocketIO(app) #, logger=True, engineio_logger=True

# Global variables
executable_status = "Stopped"
recent_log_content = ""
cpu_utilization = 0.0
ram_utilization = 0.0
items_data = {}

# Utility functions
def start_server():
    try:
        subprocess.Popen(['Aki.Server.exe'])
        check_status()
    except Exception as e:
        app.logger.error(f'Error starting the server: {e}')

def stop_server():
    try:
        subprocess.run(['taskkill', '/IM', 'Aki.Server.exe', '/F'], check=True)
    except subprocess.CalledProcessError as e:
        app.logger.error(f'Error stopping the server: {e}')

def check_status():
    global executable_status
    try:
        process_name = 'Aki.Server.exe'
        running_processes = [p.info['name'] for p in psutil.process_iter(['pid', 'name'])]
        executable_status = "Running" if process_name in running_processes else "Stopped"
        update_status()
    except Exception as e:
        app.logger.error(f'Error checking the status: {e}')

def update_status():
    socketio.emit('status_update', {'status': executable_status}, namespace='/status')

def update_resource_utilization():
    global cpu_utilization, ram_utilization
    with open(os.devnull, 'w') as null_file:
        while True:
            cpu_utilization = psutil.cpu_percent(interval=1)
            ram_utilization = psutil.virtual_memory().percent
            socketio.emit('resource_update', {'cpu': cpu_utilization, 'ram': ram_utilization}, namespace='/status')
            time.sleep(1)

# Routes
@app.route('/')
def home():
    return render_template('index.html', title='Home', cpu=cpu_utilization, ram=ram_utilization)

@app.route('/get_resource_utilization', methods=['GET'])
def get_resource_utilization():
    global cpu_utilization, ram_utilization
    return jsonify({'cpu': cpu_utilization, 'ram': ram_utilization})

@app.route('/start_server', methods=['POST'])
def start_server_route():
    start_server_thread = threading.Thread(target=start_server)
    start_server_thread.start()
    return redirect(url_for('home'))

@app.route('/stop_executable', methods=['POST'])
def stop_server_route():
    stop_thread = threading.Thread(target=stop_server)
    stop_thread.start()
    stop_thread.join()
    return redirect(url_for('home'))

@app.route('/check_status_socket', methods=['POST'])
def check_status_socket_route():
    status_thread = threading.Thread(target=check_status)
    status_thread.start()
    return redirect(url_for('home'))

@app.route('/fetch_logs')
def fetch_logs():
    log_directory = 'user/logs'
    log_pattern = 'server-*.log'
    number_of_lines = 100  # Number of lines to fetch from the end of the log file

    try:
        # List all log files
        log_files = glob.glob(os.path.join(log_directory, log_pattern))
        
        # Find the most recent log file
        if log_files:
            latest_log_file = max(log_files, key=os.path.getmtime)

            # Read the last few lines of the most recent log file
            with open(latest_log_file, 'r') as file:
                # Efficient way to get the last few lines
                lines = file.readlines()[-number_of_lines:]
                log_content = ''.join(lines)
        else:
            log_content = "No log files found."
    except Exception as e:
        log_content = f"Error reading log file: {str(e)}"

    return jsonify({'logs': log_content})

# WebSocket events
@socketio.on('connect', namespace='/status')
def handle_connect():
    update_status()

@socketio.on('connect', namespace='/logs')
def handle_log_connect():
    emit('log_update', {'content': recent_log_content})

#################### PMC Page ####################

def load_item_data():
    global items_data
    try:
        with open('items/items_data.json', 'r', encoding='utf-8') as file:
            items_list = json.load(file)
            # Adjust the dictionary comprehension to match the JSON structure
            items_data = {item['item']['_id']: item['locale']['Name'] for item in items_list}
        print("Loaded items data:", list(items_data.items())[:5])  # Print first 5 items for checking
    except Exception as e:
        print(f"Error loading item data: {e}")

@app.route('/get_item_names', methods=['POST'])
def get_item_names():
    # Assuming you receive a list of 'tpl_ids' from the POST request
    tpl_ids = request.json.get('tpl_ids', [])
    item_names = [items_data.get(tpl_id, "Unknown") for tpl_id in tpl_ids]
    return jsonify({"itemNames": item_names})

@app.route('/pmc')
def pmc():
    folder_path = 'user\\profiles'
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

                # Get equipment items' tpl IDs
                equipment_tpl_ids = [item['_tpl'] for item in inventory.get('items', []) if item.get('parentId') == equipment_id]

                pmc_info.append({
                    "nickname": info.get("LowerNickname", "Unknown"),
                    "level": info.get("Level", "Unknown"),
                    "side": info.get("Side", "Unknown"),
                    "equipment_tpl_ids": equipment_tpl_ids  # Add this
                })

    return render_template('pmc.html', title='PMC', pmc_info=pmc_info)

# Main entry point
if __name__ == '__main__':
    resource_thread = threading.Thread(target=update_resource_utilization)
    resource_thread.start()

    load_item_data()

    socketio.run(app, host='0.0.0.0', debug=True)