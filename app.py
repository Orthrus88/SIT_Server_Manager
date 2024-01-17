# Standard library imports
import os
import subprocess
import threading
import time
import tailer  # Ensure this module is installed
import logging

# Third-party imports
from flask import Flask, jsonify, redirect, render_template, url_for
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

def tail_log_file():
    while True:
        try:
            log_files = [f for f in os.listdir('user\\logs') if fnmatch(f, 'server-*.log')]
            log_files.sort(key=lambda x: os.path.getmtime(os.path.join('user\\logs', x)), reverse=True)
            if log_files:
                most_recent_log_file = os.path.join('user\\logs', log_files[0])
                for line in tailer.follow(open(most_recent_log_file)):
                    print(f"Emitting line: {line}")  # Ensure this prints actual log lines
                    socketio.emit('log_update', {'content': 'Test message'}, namespace='/logs')
                    socketio.emit('log_update', {'content': line}, namespace='/logs')
        except Exception as e:
            print(f'Error tailing log file: {e}')
        time.sleep(10)
'''
def emit_test_log():
    while True:
        time.sleep(5)  # Emit a test message every 5 seconds
        socketio.emit('log_update', {'content': 'Test log message\n'}, namespace='/logs')
        print ('end of emit test log')
'''
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

# WebSocket events
@socketio.on('connect', namespace='/status')
def handle_connect():
    update_status()

@socketio.on('connect', namespace='/logs')
def handle_log_connect():
    emit('log_update', {'content': recent_log_content})

# Main entry point
if __name__ == '__main__':
    resource_thread = threading.Thread(target=update_resource_utilization)
    resource_thread.start()

    log_thread = threading.Thread(target=tail_log_file)
    log_thread.start()

    #test_log_thread = threading.Thread(target=emit_test_log)
    #test_log_thread.start()

    #app.logger.setLevel(logging.DEBUG)

    socketio.run(app, host='0.0.0.0', debug=True)