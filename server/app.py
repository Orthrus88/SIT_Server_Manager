# app.py
from flask import Flask, render_template, redirect, url_for, jsonify
from flask_socketio import SocketIO, emit
import subprocess
import threading
import os
import time
import psutil
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

app = Flask(__name__)
socketio = SocketIO(app)

# Global variable to track executable status
executable_status = "Stopped"

# Global variable to store the most recent log file content
recent_log_content = ""

# Global variables for resource utilization
cpu_utilization = 0.0
ram_utilization = 0.0

# Get resource utilization 
@app.route('/get_resource_utilization', methods=['GET'])
def get_resource_utilization():
    global cpu_utilization, ram_utilization
    return jsonify({'cpu': cpu_utilization, 'ram': ram_utilization})

def update_resource_utilization():
    global cpu_utilization, ram_utilization
    with open(os.devnull, 'w') as null_file:
        while True:
            cpu_utilization = psutil.cpu_percent(interval=1)
            ram_utilization = psutil.virtual_memory().percent
            socketio.emit('resource_update', {'cpu': cpu_utilization, 'ram': ram_utilization}, namespace='/status')
            time.sleep(1)

def update_status():
    socketio.emit('status_update', {'status': executable_status}, namespace='/status')

class LogFileHandler(FileSystemEventHandler):
    def on_modified(self, event):
        global recent_log_content
        if event.is_directory:
            return
        if event.event_type == 'modified':
            # Read the content of the most recent log file
            log_files = [f for f in os.listdir('user/logs') if f.endswith('.log')]
            log_files.sort(key=lambda x: os.path.getmtime(os.path.join('user/logs', x)), reverse=True)
            if log_files:
                most_recent_log_file = os.path.join('user/logs', log_files[0])
                with open(most_recent_log_file, 'r') as file:
                    recent_log_content = file.read()
                # Emit the updated content to the connected clients
                socketio.emit('log_update', {'content': recent_log_content}, namespace='/logs')


# Home Page
@app.route('/')
def home():
    return render_template('index.html', title='Home', cpu=cpu_utilization, ram=ram_utilization)

# Start server functionality
def start_server():
    try:
        subprocess.Popen(['Aki.Server.exe'])
        check_status()  # Update the status after starting the server
    except Exception as e:
        print(f'Error starting the server: {e}')

# Start server route
@app.route('/start_server', methods=['POST'])
def start_server_route():
    # Start the server in a separate thread
    start_server_thread = threading.Thread(target=start_server)
    start_server_thread.start()
    return redirect(url_for('home'))

# Stop server functionality
def stop_server():
    try:
        # Use subprocess.run to wait for the process to complete
        subprocess.run(['taskkill', '/IM', 'Aki.Server.exe', '/F'], check=True)
    except subprocess.CalledProcessError as e:
        print(f'Error stopping the server: {e}')

# Stop server route
@app.route('/stop_executable', methods=['POST'])
def stop_server_route():
    # Stop the executable in a separate thread
    stop_thread = threading.Thread(target=stop_server)
    stop_thread.start()
    stop_thread.join()  # Wait for the thread to finish before redirecting
    return redirect(url_for('home'))

# Check the status of Aki.Server.exe to see if it's running
def check_status():
    global executable_status
    try:
        # Check if the process is running
        process_name = 'Aki.Server.exe'  # Update with your actual name
        running_processes = [p.info['name'] for p in psutil.process_iter(['pid', 'name'])]
        if process_name in running_processes:
            executable_status = "Running"
        else:
            executable_status = "Stopped"
        update_status()
    except Exception as e:
        print(f'Error checking the status: {e}')

# Check status socket and route
@app.route('/check_status_socket', methods=['POST'])
def check_status_socket_route():
    # Check the status of the executable in a separate thread
    status_thread = threading.Thread(target=check_status)
    status_thread.start()
    return redirect(url_for('home'))

# Socket for status on socketio
@socketio.on('connect', namespace='/status')
def handle_connect():
    update_status()

@socketio.on('connect', namespace='/logs')
def handle_log_connect():
    # Send the most recent log content to the newly connected client
    emit('log_update', {'content': recent_log_content})

def start_log_monitor():
    event_handler = LogFileHandler()
    observer = Observer()
    observer.schedule(event_handler, path='user/logs', recursive=False)
    observer.start()

if __name__ == '__main__':
    resource_thread = threading.Thread(target=update_resource_utilization)
    resource_thread.start()

    # Run the Flask app without debug mode
    socketio.run(app, host='0.0.0.0', debug=True)