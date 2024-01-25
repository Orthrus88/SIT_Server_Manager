# Standard library imports
import os
import subprocess
import glob
import re

# Third-party imports
import psutil

# Application imports
from scripts.shared import socketio


# Global variable

executable_status = "Stopped"
recent_log_content = ""
connected_players = {}  # Holds player info including raid status
players_in_raid = set()  # Tracks player IDs currently in a raid
connection_info = "Not found"

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
                lines = file.readlines()[-number_of_lines:]
                log_content = ''.join(lines)
                update_connected_players(log_content)  # Update connected players
        else:
            log_content = "No log files found."
    except Exception as e:
        log_content = f"Error reading log file: {str(e)}"

    return log_content

def update_connected_players(log_content):
    global connected_players, players_in_raid
    connect_pattern = re.compile(r'\[WS\] Player: (\w+) \((\w+)\) has connected')
    disconnect_pattern = re.compile(r'\[WS\] Socket lost, deleting handle')
    start_raid_pattern = re.compile(r'Start a Coop Server (\w+)|Added authorized user: (\w+) in server: (\w+)')
    end_raid_pattern = re.compile(r'Raid outcome:')

    for line in log_content.splitlines():
        player_id = None

        connect_match = connect_pattern.search(line)
        if connect_match:
            player_name, player_id = connect_match.groups()
            connected_players[player_id] = player_name
            if player_id in players_in_raid:
                connected_players[player_id] += " (In Raid)"

        disconnect_match = disconnect_pattern.search(line)
        if disconnect_match and player_id and player_id not in players_in_raid:
            connected_players.pop(player_id, None)

        start_raid_match = start_raid_pattern.search(line)
        if start_raid_match:
            player_id = start_raid_match.group(1) or start_raid_match.group(2) or start_raid_match.group(3)
            if player_id:
                players_in_raid.add(player_id)
                if player_id in connected_players:
                    connected_players[player_id] += " (In Raid)"

        end_raid_match = end_raid_pattern.search(line)
        if end_raid_match:
            for pid in list(players_in_raid):
                if pid in connected_players:
                    connected_players[pid] = connected_players[pid].replace(" (In Raid)", "")
                players_in_raid.remove(pid)

    socketio.emit('connected_players_update', {'players': list(connected_players.values())}, namespace='/status')