import { lookup } from 'node:dns/promises';
import net from 'node:net';
import ipaddr from 'ipaddr.js';

export function isPublicAddress(value) {
  try {
    let ip = ipaddr.parse(value);
    if (ip.kind() === 'ipv6' && ip.isIPv4MappedAddress()) ip = ip.toIPv4Address();
    return ip.range() === 'unicast' &&
      (ip.kind() === 'ipv4' || ip.match(ipaddr.parseCIDR('2000::/3')));
  } catch { return false; }
}

export async function resolvePublic(hostname, resolver = lookup) {
  if (typeof hostname !== 'string' || hostname.length > 253 ||
      !/^[a-z\d.:-]+$/i.test(hostname) || hostname.includes('%')) throw new Error('Invalid destination');
  if (ipaddr.isValid(hostname)) {
    if (!isPublicAddress(hostname)) throw new Error('Private destination blocked');
    const address = ipaddr.process(hostname).toString();
    return { address, family: net.isIP(address) };
  }
  if (hostname === 'localhost' || /\.(localhost|local|internal|home|lan)\.?$/i.test(hostname))
    throw new Error('Internal hostname blocked');
  const answers = await resolver(hostname, { all: true, verbatim: true });
  if (!answers.length || answers.some(({ address }) => !isPublicAddress(address)))
    throw new Error('Non-public DNS answer blocked');
  return answers.find(answer => answer.family === 4) || answers[0];
}

// The validated address, not the hostname, is passed to net.connect. Every TCP
// connection repeats validation. DNS changes cannot redirect a checked request
// to a private address after the check.
export class SecureSocket {
  constructor(hostname, port) {
    this.hostname = hostname;
    this.port = port;
    this.pending = [];
    this.waiter = null;
    this.closed = false;
  }
  async connect() {
    if (![80, 443].includes(this.port)) throw new Error('Destination port blocked');
    const { address, family } = await resolvePublic(this.hostname);
    if (this.closed) throw new Error('Stream closed');
    await new Promise((resolve, reject) => {
      this.socket = net.createConnection({ host: address, family, port: this.port });
      this.socket.setTimeout(90000, () => this.socket.destroy());
      this.socket.once('error', reject);
      this.socket.once('connect', resolve);
      this.socket.on('error', () => this.close());
      this.socket.on('close', () => this.close());
      this.socket.on('end', () => this.close());
      this.socket.on('data', data => {
        this.socket.pause();
        if (this.waiter) { const done = this.waiter; this.waiter = null; done(data); }
        else this.pending.push(data);
      });
    });
  }
  recv() {
    if (this.pending.length) return Promise.resolve(this.pending.shift());
    if (this.closed) return Promise.resolve(null);
    return new Promise(resolve => { this.waiter = resolve; this.socket.resume(); });
  }
  send(data) {
    return new Promise((resolve, reject) => {
      if (this.closed || !this.socket) return reject(new Error('Stream closed'));
      this.socket.write(data, error => error ? reject(error) : resolve());
    });
  }
  pause() { this.socket?.pause(); }
  resume() { if (this.waiter) this.socket?.resume(); }
  close() {
    this.closed = true;
    this.socket?.destroy();
    this.waiter?.(null);
    this.waiter = null;
  }
}
