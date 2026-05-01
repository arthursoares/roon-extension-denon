'use strict';
const net = require('net');
const EventEmitter = require('events');
const Promise = require('bluebird');

class Connection extends EventEmitter {

  get host() {
    return this._host;
    }

  get port() {
      return this._port;
  }

  get socket() {
    return this._socket;
  }
    

  constructor(host, port = 23) {
    super();

    this._host = host;
    this._port = port;
    this._socketInitialized = false;
    this._rxBuffer = '';

    // Initialize socket once in constructor
    this.initializeSocket();
  }

  initializeSocket() {
    // Guard against double initialization to prevent memory leaks
    if (this._socketInitialized) {
      return;
    }

    this._socket = new net.Socket();
    this._socketInitialized = true;

    this.socket.setEncoding('ascii');

    // Denon protocol terminates every message with '\r'. TCP can split a single
    // message across reads or coalesce several into one — emit one 'data' event
    // per complete frame so consumers (regex parser, audyssey prefix matcher,
    // raw-data logger) never see a partial or doubled message.
    this.socket.on('data', (chunk) => {
      this._rxBuffer += chunk;
      let idx;
      while ((idx = this._rxBuffer.indexOf('\r')) !== -1) {
        const frame = this._rxBuffer.slice(0, idx);
        this._rxBuffer = this._rxBuffer.slice(idx + 1);
        // Preserve historical behavior: re-append the '\r' so consumers that
        // use regex with a trailing '\r' (denon_client._applyRegex) still match.
        this.emit('data', frame + '\r');
      }
    });

    this.socket.on('close', (hadError) => {
      this._rxBuffer = '';
      this.emit('close', hadError);
    });

    this.socket.on('error', (error) => {
      this.emit('error', error);
    });

    this.socket.on('connect', () => {
      this.emit('connect');
    });
  }

  write(command) {
    return new Promise((resolve, reject) => {
      try {
        this.socket.write(`${command}\r`, 'ascii', (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  connect()
  {
    return new Promise((resolve, reject) => {
      // Socket is already initialized in constructor, skip double initialization
      // this.initializeSocket();

      const onConnect = () => {
        this.socket.removeListener('error', onError);
        resolve();
      };
      const onError = (error) => {
        this.socket.removeListener('connect', onConnect);
        reject(error);
      };

      this.socket.once('connect', onConnect);
      this.socket.once('error', onError);

      this.socket.connect(this.port, this.host);
    });
  }

  disconnect()
  {
    this.socket.end();
  }
}

module.exports = Connection;
