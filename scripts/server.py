# Standard library imports
import os
import subprocess
import time
import glob
import threading

# Third-party imports
import psutil

# Application imports
from scripts.shared import socketio


# Global variable

executable_status = "Stopped"
recent_log_content = ""

# Server-related utility functions
def start_server(app):
    try:
        subprocess.Popen(['Aki.Server.exe'])
        check_status()
    except Exception as e:
        app.logger.error(f'Error starting the server: {e}')

def stop_server(app):
    try:
        subprocess.run(['taskkill', '/IM', 'Aki.Server.exe', '/F'], check=True)
    except subprocess.CalledProcessError as e:
        app.logger.error(f'Error stopping the server: {e}')

def check_status(app):
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

    return log_content