"use strict";

const { describe, test, expect, beforeEach } = require('@jest/globals');
const EventEmitter = require('events');

// Stub net.Socket so Connection runs without opening a real TCP connection.
// We capture the data/close handlers Connection registers on the socket and
// drive them directly to simulate what Node's net layer would deliver.
class FakeSocket extends EventEmitter {
    constructor() {
        super();
        this.destroyed = false;
        this.write = jest.fn((_data, _enc, cb) => { if (cb) cb(); });
        this.connect = jest.fn();
        this.setEncoding = jest.fn();
    }
    destroy() { this.destroyed = true; this.emit('close', false); }
}

jest.mock('net', () => ({ Socket: jest.fn() }));
const net = require('net');

const Connection = require('../lib/denon-client/lib/connection');

describe('Connection framing', () => {
    let conn;
    let fake;

    beforeEach(() => {
        fake = new FakeSocket();
        net.Socket.mockImplementation(() => fake);
        conn = new Connection('192.0.2.1');
    });

    test('emits one data event per CR-terminated frame', () => {
        const seen = [];
        conn.on('data', (frame) => seen.push(frame));

        // Two complete frames coalesced into one TCP read
        fake.emit('data', 'PWON\rMV80\r');

        expect(seen).toEqual(['PWON\r', 'MV80\r']);
    });

    test('buffers a frame split across multiple TCP reads', () => {
        const seen = [];
        conn.on('data', (frame) => seen.push(frame));

        fake.emit('data', 'SSDIM ');
        expect(seen).toEqual([]);

        fake.emit('data', 'DAR\r');
        expect(seen).toEqual(['SSDIM DAR\r']);
    });

    test('keeps trailing partial data buffered until the next CR arrives', () => {
        const seen = [];
        conn.on('data', (frame) => seen.push(frame));

        fake.emit('data', 'PWON\rMV');
        expect(seen).toEqual(['PWON\r']);

        fake.emit('data', '80\r');
        expect(seen).toEqual(['PWON\r', 'MV80\r']);
    });

    test('forwards hadError on socket close', () => {
        const closes = [];
        conn.on('close', (hadError) => closes.push(hadError));

        fake.emit('close', true);

        expect(closes).toEqual([true]);
    });

    test('clears the receive buffer on close so a reconnect starts clean', () => {
        const seen = [];
        conn.on('data', (frame) => seen.push(frame));

        fake.emit('data', 'PARTIAL');     // no CR yet
        fake.emit('close', false);
        fake.emit('data', 'PWON\r');      // after reconnect-equivalent

        expect(seen).toEqual(['PWON\r']);  // PARTIAL was discarded
    });
});
