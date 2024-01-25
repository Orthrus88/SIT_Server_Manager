# Standard library imports
import os
import threading
import time


# Third-party imports
from flask import Flask, jsonify, redirect, render_template, url_for, request, redirect, flash, session
from flask_socketio import emit
import psutil

# Import server functions from scripts.server
from scripts.server import start_server, stop_server, check_status, fetch_logs, update_status, recent_log_content
from scripts.pmc import load_item_data, get_item_names, pmc, delete_profile
from scripts.shared import socketio

# SSL Setup
import eventlet
import eventlet.wsgi
from eventlet import wrap_ssl

# Application setup
app = Flask(__name__)
socketio.init_app(app) #, logger=True, engineio_logger=True <- Debug statements for testing
app.secret_key = 'your_secret_key' #session token change to w/e you want

# Global variables
cpu_utilization = 0.0
ram_utilization = 0.0

# Routes
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        if username == 'admin' and password == 'orthrus':
            session['logged_in'] = True  # Set session variable
            return redirect(url_for('home'))
        else:
            flash('Invalid credentials')
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('logged_in', None)  # Remove session variable
    return redirect(url_for('login'))

@app.route('/')
def home():
    if not session.get('logged_in'):
        return redirect(url_for('login'))
    return render_template('index.html', title='Home', cpu=cpu_utilization, ram=ram_utilization)

################## Get resource utilization and convert it to json format ##################
@app.route('/get_resource_utilization', methods=['GET'])
def get_resource_utilization():
    global cpu_utilization, ram_utilization
    return jsonify({'cpu': cpu_utilization, 'ram': ram_utilization})

################## Do not move this out of app.py ##################
def update_resource_utilization():
    global cpu_utilization, ram_utilization
    with open(os.devnull, 'w') as null_file:
        while True:
            cpu_utilization = psutil.cpu_percent(interval=1)
            ram_utilization = psutil.virtual_memory().percent
            socketio.emit('resource_update', {'cpu': cpu_utilization, 'ram': ram_utilization}, namespace='/status')
            time.sleep(1)
################## Do not move this out of app.py ##################

@app.route('/start_server', methods=['POST'])
def start_server_route():
    start_server_thread = threading.Thread(target=start_server, args=(app,))
    start_server_thread.start()
    return redirect(url_for('home'))

@app.route('/stop_executable', methods=['POST'])
def stop_server_route():
    stop_thread = threading.Thread(target=stop_server, args=(app,))
    stop_thread.start()
    stop_thread.join()
    return redirect(url_for('home'))

@app.route('/check_status_socket', methods=['POST'])
def check_status_socket_route():
    status_thread = threading.Thread(target=check_status, args=(app,))
    status_thread.start()
    return redirect(url_for('home'))

@app.route('/fetch_logs')
def fetch_logs_route():
    log_content = fetch_logs()
    return jsonify({'logs': log_content})

# WebSocket events
@socketio.on('connect', namespace='/status')
def handle_connect():
    update_status()

@socketio.on('connect', namespace='/logs')
def handle_log_connect():
    emit('log_update', {'content': recent_log_content})

#################### PMC Page ####################
@app.route('/get_item_names', methods=['POST'])
def get_item_names_route():
    return get_item_names()

@app.route('/pmc')
def pmc_route():
    if not session.get('logged_in'):
        return redirect(url_for('login'))
    return pmc()

@app.route('/delete_profile', methods=['POST'])
def delete_profile_route():
    data = request.get_json()
    filename = data.get('filename')
    if delete_profile(filename):
        return jsonify({'success': True}), 200
    else:
        return jsonify({'success': False}), 404

# Main entry point
if __name__ == '__main__':
    resource_thread = threading.Thread(target=update_resource_utilization)
    resource_thread.daemon = True  # This makes the thread exit when the main thread does
    resource_thread.start()

    load_item_data()

    ssl_context = (os.path.join('cert', 'cert.pem'), os.path.join('cert', 'key.pem'))
    socket = eventlet.listen(('0.0.0.0', 443))
    socket_ssl = wrap_ssl(socket, certfile=ssl_context[0], keyfile=ssl_context[1], server_side=True)

    eventlet.wsgi.server(socket_ssl, app)

    #socketio.run(app, host='0.0.0.0', debug=True)