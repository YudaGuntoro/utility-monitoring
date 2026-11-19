// Run: node scripts/demo-telemetry.mjs --live
// Only DEMO-* meters are created or written. No existing meters are changed.
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const api = (process.env.DEMO_API_URL || 'http://localhost:5241').replace(/\/$/, '');
const live = process.argv.includes('--live');
const days = Number(process.env.DEMO_HISTORY_DAYS || 7);
if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error('DEMO_HISTORY_DAYS must be between 1 and 30.');
let token;
async function login() {
  const response = await fetch(`${api}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: process.env.DEMO_USERNAME || 'root', password: process.env.DEMO_PASSWORD || 'root_native' }) });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.message || 'Demo login failed');
  token = body.data.access_token;
}
async function request(path, method = 'GET', data, retry = true) {
  const response = await fetch(`${api}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: data == null ? undefined : JSON.stringify(data) });
  if (response.status === 401 && retry) { await login(); return request(path, method, data, false); }
  const body = await response.json();
  if (!response.ok || body.success === false) throw new Error(`${path}: ${body.message || response.status}`);
  return body.data;
}
const utf = text => { const value = Buffer.from(text); const length = Buffer.alloc(2); length.writeUInt16BE(value.length); return Buffer.concat([length, value]); };
const packet = (header, body) => {
  const bytes = [header]; let length = body.length;
  do { let digit = length % 128; length = Math.floor(length / 128); if (length > 0) digit |= 128; bytes.push(digit); } while (length > 0);
  return Buffer.concat([Buffer.from(bytes), body]);
};
let socket;
async function connect() {
  if (socket && !socket.destroyed) return;
  await new Promise((resolve, reject) => {
    const current = net.createConnection({ host: process.env.DEMO_MQTT_HOST || '127.0.0.1', port: Number(process.env.DEMO_MQTT_PORT || 1883) });
    let received = Buffer.alloc(0);
    current.setTimeout(10000);
    current.once('timeout', () => current.destroy(new Error('MQTT connect timeout')));
    current.on('error', reject);
    current.on('data', data => {
      received = Buffer.concat([received, data]);
      if (received.length < 4) return;
      if (received[0] !== 0x20 || received[3] !== 0) { current.destroy(); reject(new Error('Demo broker connection rejected')); return; }
      current.setTimeout(0); socket = current; resolve();
    });
    current.once('connect', () => current.write(packet(0x10, Buffer.concat([utf('MQTT'), Buffer.from([4, 2, 0, 120]), utf(`utility-demo-${process.pid}`)]))));
  });
}
async function publish(topic, data) {
  await connect();
  await new Promise((resolve, reject) => socket.write(packet(0x30, Buffer.concat([utf(topic), Buffer.from(JSON.stringify(data))])), error => error ? reject(error) : resolve()));
}
const meters = [
  { kind: 'power', code: 'DEMO-PM-01', name: 'Demo - Production Panel', location: 'Demo Production Area', base: 125000, load: 42 },
  { kind: 'power', code: 'DEMO-PM-02', name: 'Demo - HVAC Panel', location: 'Demo Utility Room', base: 98000, load: 28 },
  { kind: 'power', code: 'DEMO-PM-03', name: 'Demo - Compressor Panel', location: 'Demo Compressor Room', base: 72000, load: 35, warning: true },
  { kind: 'water', code: 'DEMO-WM-01', name: 'Demo - Process Water', location: 'Demo Production Area', base: 15400, load: 12, pressure: 3.8 },
  { kind: 'water', code: 'DEMO-WM-02', name: 'Demo - Cooling Tower', location: 'Demo Cooling Tower', base: 8900, load: 22, pressure: 3.1, warning: true },
  { kind: 'water', code: 'DEMO-WM-03', name: 'Demo - Reserve Tank', location: 'Demo Reserve Tank', base: 4200, load: 4, pressure: 2.8, offline: true },
  { kind: 'compressed-air', code: 'DEMO-AIR-01', name: 'Demo - Air Header A', location: 'Demo Assembly Line', base: 284000, load: 260, pressure: 6.8 },
  { kind: 'compressed-air', code: 'DEMO-AIR-02', name: 'Demo - Air Header B', location: 'Demo Packing Line', base: 196000, load: 190, pressure: 5.3, warning: true },
];
const rounded = value => Number(value.toFixed(3));
function measurements(meter, time) {
  const local = new Date(time.getTime() + 7 * 3600000);
  const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
  const daytime = Math.max(0, Math.sin((hour - 6) / 12 * Math.PI));
  const drift = Math.sin(time.getTime() / 1800000 + meters.indexOf(meter)) * .07;
  return { flow: rounded(meter.load * (.55 + daytime * .65 + drift)), pressure: rounded((meter.pressure ?? 0) + Math.sin(hour) * .12), temperature: rounded(26 + daytime * 5) };
}
async function write(meter, time, elapsedHours) {
  const value = measurements(meter, time);
  const nextTotal = rounded(meter.total + value.flow * Math.max(0, elapsedHours));
  if (meter.kind === 'power') {
    const voltage = rounded(230 + Math.sin(time.getTime() / 3600000) * 2.5);
    const factor = meter.warning ? .84 : .96;
    const current = rounded(value.flow * 1000 / (3 * voltage * factor));
    await publish(`utility/power/${meter.code}/telemetry`, {
      deviceCode: meter.code, timestamp: time.toISOString(), status: meter.warning ? 'warning' : 'online',
      measurements: {
        voltage: { l1n: voltage, l2n: voltage - 1.2, l3n: voltage + .8, l1l2: voltage * 1.732, l2l3: (voltage - .4) * 1.732, l3l1: (voltage + .4) * 1.732 },
        current: { l1: current, l2: rounded(current * .98), l3: rounded(current * 1.02), neutral: 1.2 },
        power: { active_kw: value.flow, reactive_kvar: rounded(Math.sqrt((value.flow / factor) ** 2 - value.flow ** 2)), apparent_kva: rounded(value.flow / factor), power_factor: factor },
        frequency_hz: 50.01, energy: { import_kwh: nextTotal, export_kwh: 0 }
      }
    });
  } else {
    await request(`/api/utilities/${meter.kind}/devices/${meter.id}/telemetry`, 'POST', {
      timestamp: time.toISOString(), flowRate: value.flow, totalVolume: nextTotal,
      pressureBar: value.pressure, temperatureC: value.temperature,
      ...(meter.kind === 'compressed-air' ? { powerKw: rounded(value.flow * .16) } : {})
    });
  }
  meter.total = nextTotal;
  meter.lastTime = time.getTime();
}

await login();
await connect();
for (const meter of meters) {
  const path = meter.kind === 'power' ? '/api/power/devices' : `/api/utilities/${meter.kind}/devices`;
  const existing = (await request(path)).find(row => (row.device_code ?? row.deviceCode) === meter.code);
  const device = existing || await request(path, 'POST', meter.kind === 'power' ? {
    device_code: meter.code, name: meter.name, location: meter.location, model: 'Demo Power Meter', gateway_id: 'DEMO-GW-01', mqtt_topic: `utility/power/${meter.code}/telemetry`, enabled: true
  } : {
    deviceCode: meter.code, name: meter.name, location: meter.location, enabled: true,
    lowPressureBar: meter.kind === 'compressed-air' ? 6 : 2,
    highFlowRate: meter.warning && meter.kind === 'water' ? 15 : meter.load * 1.5
  });
  if (!device.enabled) throw new Error(`${meter.code} is disabled; enable it to run the demo.`);
  meter.id = device.id;
  meter.total = device.latest?.energy_import_kwh ?? device.latest?.totalVolume ?? meter.base;
  if (!device.latest) {
    const end = Date.now() - (meter.offline ? 45 * 60000 : 0);
    for (let index = days * 24; index >= 0; index--) {
      await write(meter, new Date(end - index * 3600000), index === days * 24 ? 0 : 1);
      if (index % 48 === 0) console.log(`Seeding ${meter.code}: ${days * 24 - index + 1}/${days * 24 + 1} readings`);
    }
  } else {
    meter.lastTime = Date.now();
    console.log(`Keeping existing history for ${meter.code}.`);
  }
  if (!meter.offline) await write(meter, new Date(), 0);
}
console.log('Demo seed complete: 3 power meters, 3 water meters, 2 compressed-air meters.');
console.log('DEMO-WM-03 stays offline; DEMO-WM-02, DEMO-AIR-02 and DEMO-PM-03 show warnings.');

if (live) {
  console.log('Live demo running every 30 seconds. Stop with Ctrl+C.');
  process.on('SIGINT', () => { socket?.end(Buffer.from([0xe0, 0])); process.exit(0); });
  while (true) {
    await delay(30000);
    for (const meter of meters.filter(m => !m.offline)) {
      const now = new Date();
      try { await write(meter, now, (now.getTime() - meter.lastTime) / 3600000); }
      catch (error) { console.error(`Demo update ${meter.code}: ${error.message}`); socket?.destroy(); }
    }
  }
} else socket.end(Buffer.from([0xe0, 0]));
