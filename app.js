try {
  const t = localStorage.getItem('packetlab:theme');
  if (t === 'light' || t === 'dark')
    document.documentElement.dataset.theme = t;
}
catch {
}
import { parseCIDR, intToIPv4, allocateVLSM, findRoute } from './engine.js';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const state = {
  devices: [], links: [], selected: null, tool: 'select', packets: [], events: [], packetCount: 0, zoom: 1, view: 'topology', allocated: [], theme: 'dark', drag: null, linkStart: null
};
const typeInfo = {
  router: { icon: '✣', label: 'Router', ip: '192.168.10.1' }, switch: { icon: '▤', label: 'Switch', ip: '—' }, pc: { icon: '▣', label: 'PC', ip: '192.168.10.10' }, server: { icon: '▥', label: 'Server', ip: '192.168.10.100' }
};
function uid() {
  return Math.random().toString(36).slice(2, 9);
}
function seed() {
  state.devices = [{
      id: 'r1', type: 'router', name: 'Router-01', ip: '192.168.10.1', mask: '255.255.255.0', gateway: '', x: 390, y: 105, adminDown: false
    }, {
      id: 's1', type: 'switch', name: 'Switch-01', ip: '', mask: '', gateway: '', x: 390, y: 275, adminDown: false
    }, {
      id: 'pc1', type: 'pc', name: 'PC-01', ip: '192.168.10.10', mask: '255.255.255.0', gateway: '192.168.10.1', x: 150, y: 405, adminDown: false
    }, {
      id: 'srv1', type: 'server', name: 'Server-01', ip: '192.168.10.100', mask: '255.255.255.0', gateway: '192.168.10.1', x: 630, y: 405, adminDown: false
    }];
  state.links = [{
      id: 'l1', a: 'r1', b: 's1', down: false
    }, {
      id: 'l2', a: 's1', b: 'pc1', down: false
    }, {
      id: 'l3', a: 's1', b: 'srv1', down: false
    }];
  render();
}
function log(message, kind = 'green') {
  state.events.unshift({ message, kind, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
  state.events = state.events.slice(0, 30);
  renderEvents();
}
function toast(message, error = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' error' : '');
  el.textContent = message;
  const region = $('#toastRegion');
  region.append(el);
  while (region.children.length > 3)
    region.firstElementChild.remove();
  setTimeout(() => el.remove(), error ? 5000 : 3000);
}
function render() {
  renderCanvas();
  renderMetrics();
  renderInspector();
  renderInventory();
  renderPacketSelectors();
  renderEvents();
  renderPackets();
}
function renderMetrics() {
  const operational = state.links.filter(l => !l.down).length;
  $('#metricDevices').textContent = state.devices.length;
  $('#metricLinks').textContent = state.links.length;
  $('#metricHealth').textContent = state.links.length === operational && state.devices.every(d => !d.adminDown) ? 'Healthy' : 'Degraded';
  $('#metricHealth').style.color = state.links.length === operational && state.devices.every(d => !d.adminDown) ? 'var(--green)' : 'var(--red)';
  $('#healthSub').textContent = state.links.length === operational ? 'All links operational' : `${state.links.length - operational} link fault(s) detected`;
  $('#metricPackets').textContent = state.packetCount;
  $('#canvasSubtitle').textContent = `Main topology · ${state.devices.length} devices`;
  $('#selectionText').textContent = state.selected ? `Selected: ${getSelected()?.name || 'Connection'}` : 'Select a device to inspect it';
  $('#emptyHint').hidden = state.devices.length > 0;
}
function renderCanvas() {
  const svg = $('#linksLayer'), layer = $('#nodesLayer'), wrap = $('#canvasWrap');
  svg.innerHTML = '';
  layer.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${wrap.clientWidth} ${wrap.clientHeight}`);
  if (wrap.clientWidth > 0 && state.devices.length) {
    const mx = Math.max(0, wrap.clientWidth / state.zoom - 126), my = Math.max(0, wrap.clientHeight / state.zoom - 86);
    for (const d of state.devices) {
      d.x = Math.max(0, Math.min(Number(d.x) || 0, mx * 1.6));
      d.y = Math.max(0, Math.min(Number(d.y) || 0, my * 1.6));
    }
    const fit = (k, max) => {
      const v = state.devices.map(d => d[k]), lo = Math.min(...v), hi = Math.max(...v);
      if (hi <= max)
        return;
      const pad = Math.min(12, max / 2), f = hi > lo ? Math.min(1, (max - pad) / (hi - lo)) : 1;
      for (const d of state.devices)
        d[k] = Math.round(pad + (d[k] - lo) * f);
    };
    fit('x', mx);
    fit('y', my);
  }
  for (const l of state.links) {
    const a = state.devices.find(d => d.id === l.a), b = state.devices.find(d => d.id === l.b);
    if (!a || !b)
      continue;
    const ax = a.x + 63, ay = a.y + 43, bx = b.x + 63, by = b.y + 43;
    const ns = 'http://www.w3.org/2000/svg';
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', ax);
    line.setAttribute('y1', ay);
    line.setAttribute('x2', bx);
    line.setAttribute('y2', by);
    line.setAttribute('class', 'link-line' + (l.down ? ' down' : ''));
    svg.append(line);
    const hit = document.createElementNS(ns, 'line');
    hit.setAttribute('x1', ax);
    hit.setAttribute('y1', ay);
    hit.setAttribute('x2', bx);
    hit.setAttribute('y2', by);
    hit.setAttribute('class', 'link-hit');
    hit.addEventListener('click', e => {
      e.stopPropagation();
      state.selected = l.id;
      renderInspector();
      renderCanvas();
    });
    svg.append(hit);
  }
  for (const d of state.devices) {
    const el = document.createElement('div');
    el.className = 'device-node' + (state.selected === d.id ? ' selected' : '') + (d.adminDown ? ' fault' : '');
    el.dataset.type = d.type;
    el.style.left = d.x + 'px';
    el.style.top = d.y + 'px';
    el.innerHTML = `<i class="node-status"></i><span class="node-icon">${typeInfo[d.type].icon}</span><strong class="node-name"></strong><span class="node-ip"></span>`;
    el.querySelector('.node-name').textContent = d.name;
    el.querySelector('.node-ip').textContent = d.ip || 'No IP address';
    el.addEventListener('pointerdown', e => startDrag(e, d.id));
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (state.tool === 'connect') {
        if (!state.linkStart) {
          state.linkStart = d.id;
          toast('Select a second device to create a connection');
        }
        else if (state.linkStart !== d.id) {
          if (state.links.some(l => (l.a === state.linkStart && l.b === d.id) || (l.a === d.id && l.b === state.linkStart))) {
            toast('These devices are already connected', true);
          }
          else {
            state.links.push({
              id: uid(), a: state.linkStart, b: d.id, down: false
            });
            log(`Link created: ${device(state.linkStart).name} ↔ ${d.name}`);
            state.linkStart = null;
            render();
          }
        }
        return;
      }
      state.selected = d.id;
      renderCanvas();
      renderInspector();
    });
    layer.append(el);
  }
}
function device(id) {
  return state.devices.find(d => d.id === id);
}
function getSelected() {
  return device(state.selected) || state.links.find(l => l.id === state.selected);
}
function startDrag(e, id) {
  if (state.tool === 'connect')
    return;
  const d = device(id);
  if (!d)
    return;
  state.selected = id;
  renderInspector();
  const rect = $('#canvasWrap').getBoundingClientRect();
  const sx = e.clientX, sy = e.clientY, ox = d.x, oy = d.y;
  const move = ev => {
    d.x = Math.max(0, Math.min($('#canvasWrap').clientWidth - 126, ox + ev.clientX - sx));
    d.y = Math.max(0, Math.min($('#canvasWrap').clientHeight - 86, oy + ev.clientY - sy));
    const node = $(`.device-node[data-type="${d.type}"]`);
    const el = [...$$('.device-node')].find(n => n.querySelector('.node-name')?.textContent === d.name);
    if (el) {
      el.style.left = d.x + 'px';
      el.style.top = d.y + 'px';
    }
    renderLinksOnly();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    renderCanvas();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
function renderLinksOnly() {
  const svg = $('#linksLayer');
  [...svg.querySelectorAll('.link-line,.link-hit')].forEach(el => {
    const l = state.links.find(x => {
      const a = device(x.a), b = device(x.b);
      return a && b && Number(el.getAttribute('x1')) === a.x + 63 && Number(el.getAttribute('y1')) === a.y + 43 && Number(el.getAttribute('x2')) === b.x + 63 && Number(el.getAttribute('y2')) === b.y + 43;
    });
    if (l) {
      const a = device(l.a), b = device(l.b);
      el.setAttribute('x1', a.x + 63);
      el.setAttribute('y1', a.y + 43);
      el.setAttribute('x2', b.x + 63);
      el.setAttribute('y2', b.y + 43);
    }
  });
  renderCanvas();
}
function renderInspector() {
  const d = device(state.selected), l = state.links.find(x => x.id === state.selected), box = $('#inspectorContent');
  $('#selectionText').textContent = d ? `Selected: ${d.name}` : l ? 'Selected: connection' : 'Select a device to inspect it';
  if (d) {
    box.innerHTML = `<label class="field-label">Device name</label><input id="editName" value="${escapeAttr(d.name)}"/><div class="field-row"><div><label class="field-label">IPv4 address</label><input id="editIP" value="${escapeAttr(d.ip)}" placeholder="192.168.1.10"/></div><div><label class="field-label">Subnet mask</label><input id="editMask" value="${escapeAttr(d.mask)}" placeholder="255.255.255.0"/></div></div><label class="field-label">Default gateway</label><input id="editGateway" value="${escapeAttr(d.gateway)}" placeholder="192.168.1.1"/><div class="field-row"><div><label class="field-label">Device type</label><input value="${typeInfo[d.type].label}" disabled/></div><div><label class="field-label">Interface state</label><select id="editState"><option value="up" ${!d.adminDown ? 'selected' : ''}>Up</option><option value="down" ${d.adminDown ? 'selected' : ''}>Administratively down</option></select></div></div><div class="inspector-actions"><button class="primary-button" id="saveDevice">Save changes</button><button class="secondary-button" id="deleteDevice">Delete</button></div><div class="field-help">Changes are applied to the local simulation immediately after saving.</div>`;
    $('#saveDevice').onclick = () => {
      const ip = $('#editIP').value.trim();
      if (ip) {
        try {
          parseCIDR(ip + '/32');
        }
        catch (e) {
          toast('Invalid IPv4 address', true);
          return;
        }
      }
      const mask = $('#editMask').value.trim(), gateway = $('#editGateway').value.trim();
      if (mask) {
        try {
          maskToPrefix(mask);
        }
        catch (e) {
          toast('Invalid subnet mask', true);
          return;
        }
      }
      if (gateway) {
        try {
          parseCIDR(gateway + '/32');
        }
        catch (e) {
          toast('Invalid default gateway IPv4 address', true);
          return;
        }
      }
      d.name = $('#editName').value.trim() || d.name;
      d.ip = ip;
      d.mask = mask;
      d.gateway = gateway;
      d.adminDown = $('#editState').value === 'down';
      log(`${d.name} configuration updated`);
      render();
      toast('Device configuration saved');
    };
    $('#deleteDevice').onclick = () => {
      state.links = state.links.filter(x => x.a !== d.id && x.b !== d.id);
      state.devices = state.devices.filter(x => x.id !== d.id);
      state.selected = null;
      log(`${d.name} removed from topology`);
      render();
    };
  }
  else if (l) {
    box.innerHTML = `<div class="section-title"><strong>Physical connection</strong><span class="status-chip ${l.down ? '' : 'success'}">${l.down ? 'Down' : 'Up'}</span></div><p class="field-help">${escapeHtml(device(l.a)?.name || 'Unknown')} ↔ ${escapeHtml(device(l.b)?.name || 'Unknown')}</p><label class="field-label">Link state</label><select id="editLinkState"><option value="up" ${!l.down ? 'selected' : ''}>Operational</option><option value="down" ${l.down ? 'selected' : ''}>Disconnected / fault</option></select><div class="inspector-actions"><button class="primary-button" id="saveLink">Apply state</button><button class="secondary-button" id="deleteLink">Remove link</button></div><div class="field-help">Disconnecting a link prevents packets from traversing this connection.</div>`;
    $('#saveLink').onclick = () => {
      l.down = $('#editLinkState').value === 'down';
      log(`Connection ${device(l.a).name} ↔ ${device(l.b).name} set ${l.down ? 'DOWN' : 'UP'}`, l.down ? 'red' : 'green');
      render();
    };
    $('#deleteLink').onclick = () => {
      state.links = state.links.filter(x => x.id !== l.id);
      state.selected = null;
      render();
      toast('Connection removed');
    };
  }
  else
    box.innerHTML = '<div class="inspector-empty"><span>◈</span><strong>Nothing selected</strong><small>Select a device or connection to view and edit its properties.</small></div>';
}
function escapeAttr(s) {
  return String(s ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}
function freeSpot() {
  const w = $('#canvasWrap'), W = Math.max(16, (w.clientWidth || 800) / state.zoom - 126), H = Math.max(16, (w.clientHeight || 500) / state.zoom - 86);
  for (let y = 16; y <= H; y += 100)
    for (let x = 16; x <= W; x += 140) {
      if (state.devices.every(d => Math.abs(d.x - x) >= 132 || Math.abs(d.y - y) >= 92))
        return { x, y };
    }
  return { x: 16 + Math.random() * Math.max(0, W - 16), y: 16 + Math.random() * Math.max(0, H - 16) };
}
function addDevice(type, x, y) {
  let n = 1;
  while (state.devices.some(d => d.name === `${typeInfo[type].label}-${String(n).padStart(2, '0')}`))
    n++;
  const base = type === 'router' ? 0 : type === 'pc' ? 10 : 100;
  let host = base + n;
  while (type !== 'switch' && host < 254 && state.devices.some(d => d.ip === `192.168.10.${host}`))
    host++;
  if (x == null || y == null) {
    const f = freeSpot();
    x ??= f.x;
    y ??= f.y;
  }
  const d = {
    id: uid(), type, name: `${typeInfo[type].label}-${String(n).padStart(2, '0')}`, ip: type === 'switch' ? '' : `192.168.10.${host}`, mask: type === 'switch' ? '' : '255.255.255.0', gateway: type === 'pc' || type === 'server' ? '192.168.10.1' : '', x, y, adminDown: false
  };
  state.devices.push(d);
  state.selected = d.id;
  log(`${d.name} added to topology`);
  render();
  toast(`${d.name} added`);
}
function renderEvents() {
  $('#eventList').innerHTML = state.events.length ? state.events.map(e => `<div class="event"><i class="event-dot ${e.kind}"></i><div><strong>${escapeHtml(e.message)}</strong><small>${e.time} · System</small></div></div>`).join('') : '<div class="field-help">No recent events.</div>';
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function renderInventory() {
  $('#inventoryCount').textContent = `${state.devices.length} ${state.devices.length === 1 ? 'device' : 'devices'}`;
  $('#deviceTable').innerHTML = state.devices.length ? `<table><thead><tr><th>Device</th><th>Type</th><th>IP address</th><th>Subnet mask</th><th>Status</th><th></th></tr></thead><tbody>${state.devices.map(d => `<tr><td><strong>${escapeHtml(d.name)}</strong></td><td>${typeInfo[d.type].label}</td><td class="mono">${d.ip || '—'}</td><td class="mono">${d.mask || '—'}</td><td class="${d.adminDown ? 'fail' : 'pass'}">${d.adminDown ? 'Admin down' : 'Operational'}</td><td><button class="text-button" data-inspect="${d.id}">Inspect</button></td></tr>`).join('')}</tbody></table>` : '<div class="inspector-empty">No devices in this topology.</div>';
  $$('[data-inspect]').forEach(b => b.onclick = () => {
    state.selected = b.dataset.inspect;
    switchView('topology');
    renderInspector();
    renderCanvas();
  });
}
function renderPacketSelectors() {
  const opts = state.devices.map(d => `<option value="${d.id}">${escapeHtml(d.name)} · ${d.ip || 'No IP'}</option>`).join('');
  const s = $('#packetSource'), d = $('#packetDestination');
  const oldS = s.value, oldD = d.value;
  s.innerHTML = opts;
  d.innerHTML = opts;
  if (state.devices.some(x => x.id === oldS))
    s.value = oldS;
  if (state.devices.some(x => x.id === oldD))
    d.value = oldD;
  if (s.options.length > 1 && s.value === d.value)
    d.selectedIndex = 1;
}
function renderPackets() {
  $('#packetCountLabel').textContent = `${state.packets.length} ${state.packets.length === 1 ? 'packet' : 'packets'}`;
  $('#packetTimeline').innerHTML = state.packets.length ? state.packets.map(p => `<div class="packet-entry"><div class="packet-entry-head"><strong>${p.type} · ${escapeHtml(p.source)} → ${escapeHtml(p.destination)}</strong><span>${p.time}</span></div><div class="packet-route">${p.path.map((id, i) => `<span class="hop ${!p.ok && i === p.path.length - 1 ? 'fail' : ''}">${escapeHtml(device(id)?.name || 'Unknown')}</span>${i < p.path.length - 1 ? '<span class="hop-arrow">→</span>' : ''}`).join('')}${!p.ok ? '<span class="hop fail">DROP</span>' : ''}</div><small class="${p.ok ? 'pass' : 'fail'}">${escapeHtml(p.reason)}</small>${p.hops?.length ? `<div class="field-help">${p.hops.map((h, i) => `${i + 1}. ${escapeHtml(h.device)} — ${escapeHtml(h.detail)}`).join('<br>')}</div>` : ''}${p.headers ? `<details class="packet-details"><summary>Inspect packet headers</summary><pre>${escapeHtml(JSON.stringify(p.headers, null, 2))}</pre></details>` : ''}</div>`).join('') : '<div class="inspector-empty"><span>⇢</span><strong>No packets yet</strong><small>Send a packet to see its journey through the topology.</small></div>';
}
function sendPacket() {
  const a = $('#packetSource').value, b = $('#packetDestination').value;
  if (!a || !b) {
    toast('Add at least two devices first', true);
    return;
  }
  if (a === b) {
    toast('Choose different source and destination devices', true);
    return;
  }
  const route = window.PacketLabAdvanced?.simulate(a, b, $('#packetType').value) || findRoute(a, b, state.devices, state.links), p = {
    id: uid(), type: $('#packetType').value, source: device(a).name, destination: device(b).name, path: route.path || [], ok: route.ok, reason: route.reason, time: new Date().toLocaleTimeString(), hops: route.hops || [], headers: route.headers || null
  };
  state.packets.unshift(p);
  state.packetCount++;
  log(`${p.type} ${p.ok ? 'delivered' : 'dropped'}: ${p.source} → ${p.destination}`, p.ok ? 'green' : 'red');
  render();
  if (route.ok)
    animatePacket(route.path);
  toast(route.ok ? 'Packet delivered successfully' : `Packet dropped: ${route.reason}`, !route.ok);
}
function animatePacket(path) {
  const svg = $('#linksLayer'), ns = 'http://www.w3.org/2000/svg';
  if (path.length < 2)
    return;
  const marker = document.createElementNS(ns, 'circle');
  marker.setAttribute('r', '6');
  marker.setAttribute('fill', '#7ce6ff');
  marker.setAttribute('stroke', '#e8fbff');
  marker.setAttribute('stroke-width', '2');
  marker.style.filter = 'drop-shadow(0 0 7px #65d7ef)';
  svg.append(marker);
  let hop = 0;
  const travel = () => {
    if (hop >= path.length - 1) {
      marker.remove();
      return;
    }
    const a = device(path[hop]), b = device(path[hop + 1]);
    if (!a || !b) {
      marker.remove();
      return;
    }
    const x1 = a.x + 63, y1 = a.y + 43, x2 = b.x + 63, y2 = b.y + 43;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('class', 'packet-line');
    svg.append(line);
    const duration = 650, start = performance.now();
    const frame = now => {
      const t = Math.min(1, (now - start) / duration);
      marker.setAttribute('cx', x1 + (x2 - x1) * t);
      marker.setAttribute('cy', y1 + (y2 - y1) * t);
      if (t < 1)
        requestAnimationFrame(frame);
      else {
        setTimeout(() => line.remove(), 500);
        hop++;
        travel();
      }
    };
    marker.setAttribute('cx', x1);
    marker.setAttribute('cy', y1);
    requestAnimationFrame(frame);
  };
  travel();
}
function switchView(name) {
  state.view = name;
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === name));
  $('#crumb').textContent = ({
    topology: 'Topology', subnets: 'Subnet planner', traffic: 'Packet inspector', devices: 'Device manager', labs: 'Lab scenarios', diagnostics: 'Diagnostics', cli: 'IOS command line', services: 'Network services', projects: 'Projects & export', assessment: 'CCNA assessment'
  })[name] || name;
  if (name === 'topology')
    renderCanvas();
  if (name === 'devices')
    renderInventory();
  if (name === 'traffic') {
    renderPacketSelectors();
    renderPackets();
  }
}
$$('.nav-item').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
$$('.palette-item').forEach(b => {
  b.addEventListener('click', () => addDevice(b.dataset.type));
  b.addEventListener('dragstart', e => e.dataTransfer.setData('device-type', b.dataset.type));
});
$('#canvasWrap').addEventListener('dragover', e => e.preventDefault());
$('#canvasWrap').addEventListener('drop', e => {
  e.preventDefault();
  const type = e.dataTransfer.getData('device-type');
  if (type) {
    const r = $('#canvasWrap').getBoundingClientRect();
    addDevice(type, e.clientX - r.left - 63, e.clientY - r.top - 43);
  }
});
$('#canvasWrap').addEventListener('click', e => {
  if (e.target.id === 'canvasWrap' || e.target.classList.contains('canvas-grid')) {
    state.selected = null;
    renderInspector();
    renderCanvas();
  }
});
$('#selectTool').onclick = () => {
  state.tool = 'select';
  state.linkStart = null;
  $('#selectTool').classList.add('selected');
  $('#connectTool').classList.remove('selected');
};
$('#connectTool').onclick = () => {
  state.tool = 'connect';
  state.linkStart = null;
  $('#connectTool').classList.add('selected');
  $('#selectTool').classList.remove('selected');
  toast('Connection tool active. Select two devices.');
};
$('#zoomIn').onclick = () => zoom(1.1);
$('#zoomOut').onclick = () => zoom(.9);
$('#fitBtn').onclick = () => {
  state.zoom = 1;
  $('#zoomLabel').textContent = '100%';
  $('#nodesLayer').style.transform = '';
  $('#linksLayer').style.transform = '';
  renderCanvas();
  toast('Topology fitted to workspace');
};
function zoom(f) {
  state.zoom = Math.max(.7, Math.min(1.5, state.zoom * f));
  $('#zoomLabel').textContent = Math.round(state.zoom * 100) + '%';
  $('#nodesLayer').style.transform = `scale(${state.zoom})`;
  $('#linksLayer').style.transform = `scale(${state.zoom})`;
  $('#linksLayer').style.transformOrigin = '0 0';
}
$('#autoLayoutBtn').onclick = () => {
  const w = $('#canvasWrap').clientWidth;
  state.devices.forEach((d, i) => {
    d.x = Math.max(15, (w - 150) / (Math.max(1, state.devices.length - 1)) * i);
    d.y = i % 2 === 0 ? 110 : 300;
  });
  render();
  toast('Devices arranged across the canvas');
};
$('#clearBtn').onclick = () => {
  if (!confirm('Remove every device and connection from this topology?'))
    return;
  state.devices = [];
  state.links = [];
  state.selected = null;
  log('Topology cleared');
  render();
};
$('#runBtn').onclick = () => {
  const result = diagnose();
  toast(result.filter(x => !x.ok).length ? 'Simulation completed with issues' : 'Simulation completed — topology healthy', result.some(x => !x.ok));
  log('Network simulation health check completed', result.some(x => !x.ok) ? 'red' : 'green');
};
$('#clearEvents').onclick = () => {
  state.events = [];
  renderEvents();
};
$('#clearPackets').onclick = () => {
  state.packets = [];
  state.packetCount = 0;
  render();
  toast('Packet history cleared');
};
$('#sendPacket').onclick = sendPacket;
// VLSM planner
let requests = [{ name: 'Engineering', hosts: 60 }, { name: 'Administration', hosts: 25 }, { name: 'Guest Wi-Fi', hosts: 12 }, { name: 'Servers', hosts: 6 }];
function renderRequests() {
  $('#subnetRequests').innerHTML = requests.map((r, i) => `<div class="subnet-request"><input data-name="${i}" value="${escapeAttr(r.name)}" aria-label="Network name"/><input data-hosts="${i}" type="number" min="1" value="${r.hosts}" aria-label="Required hosts"/><button data-remove="${i}" title="Remove">×</button></div>`).join('');
  $$('[data-name]').forEach(x => x.onchange = () => requests[+x.dataset.name].name = x.value);
  $$('[data-hosts]').forEach(x => x.onchange = () => requests[+x.dataset.hosts].hosts = +x.value);
  $$('[data-remove]').forEach(x => x.onclick = () => {
    requests.splice(+x.dataset.remove, 1);
    renderRequests();
  });
}
function allocate() {
  try {
    const result = allocateVLSM($('#parentCidr').value, requests);
    state.allocated = result;
    $('#allocationStatus').textContent = 'Allocation successful';
    $('#allocationStatus').className = 'status-chip success';
    const p = parseCIDR($('#parentCidr').value);
    const used = result.reduce((n, x) => n + x.size, 0);
    $('#subnetSummary').innerHTML = `<div class="summary-stat"><span>Parent network</span><strong>${intToIPv4(p.network)}/${p.prefix}</strong></div><div class="summary-stat"><span>Allocated blocks</span><strong>${result.length}</strong></div><div class="summary-stat"><span>Address space used</span><strong>${Math.round(used / p.size * 100)}%</strong></div>`;
    $('#subnetTableWrap').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Network</th><th>Subnet</th><th>Network address</th><th>First host</th><th>Last host</th><th>Broadcast</th><th>Usable</th></tr></thead><tbody>${result.map(r => `<tr><td><strong>${escapeHtml(r.name)}</strong></td><td class="mono">/${r.prefix}</td><td class="mono">${intToIPv4(r.network)}</td><td class="mono">${intToIPv4(r.first)}</td><td class="mono">${intToIPv4(r.last)}</td><td class="mono">${intToIPv4(r.broadcast)}</td><td>${r.usable}</td></tr>`).join('')}</tbody></table></div>`;
    toast('VLSM subnets allocated successfully');
  }
  catch (e) {
    $('#allocationStatus').textContent = 'Allocation failed';
    $('#allocationStatus').className = 'status-chip';
    $('#subnetSummary').innerHTML = `<div class="inspector-empty"><span>⚠</span><strong>Unable to allocate</strong><small>${escapeHtml(e.message)}</small></div>`;
    $('#subnetTableWrap').innerHTML = '';
    toast(e.message, true);
  }
}
$('#allocateBtn').onclick = allocate;
$('#addSubnet').onclick = () => {
  requests.push({ name: `Network ${requests.length + 1}`, hosts: 10 });
  renderRequests();
};
$('#exampleSubnet').onclick = () => {
  requests = [{ name: 'Engineering', hosts: 60 }, { name: 'Administration', hosts: 25 }, { name: 'Guest Wi-Fi', hosts: 12 }, { name: 'Servers', hosts: 6 }];
  $('#parentCidr').value = '192.168.10.0/24';
  renderRequests();
  allocate();
};
$('#resetSubnet').onclick = () => {
  requests = [];
  state.allocated = [];
  $('#subnetRequests').innerHTML = '';
  $('#subnetSummary').innerHTML = '<div class="inspector-empty"><span>▦</span><strong>Ready to calculate</strong><small>Add host requirements and allocate your address space.</small></div>';
  $('#subnetTableWrap').innerHTML = '';
  $('#allocationStatus').textContent = 'Not allocated';
  renderRequests();
};
renderRequests();
function diagnose() {
  const checks = [];
  checks.push({ name: 'Device interfaces', ok: state.devices.every(d => !d.adminDown), detail: 'Administrative interface state' });
  checks.push({ name: 'Physical connections', ok: state.links.every(l => !l.down), detail: 'Cable and link operational state' });
  checks.push({ name: 'IPv4 addressing', ok: state.devices.filter(d => d.type !== 'switch').every(d => {
      try {
        parseCIDR(d.ip + '/32');
        return true;
      }
      catch {
        return false;
      }
    }), detail: 'Valid IPv4 address configuration' });
  checks.push({ name: 'Subnet masks', ok: state.devices.filter(d => d.type !== 'switch').every(d => {
      try {
        parseCIDR('0.0.0.0/' + maskToPrefix(d.mask));
        return true;
      }
      catch {
        return false;
      }
    }), detail: 'Subnet mask configuration' });
  checks.push(...(window.PacketLabAdvanced?.diagnostics?.() || []));
  return checks;
}
function maskToPrefix(mask) {
  const n = parseCIDR(mask + '/32').ip;
  const s = (n >>> 0).toString(2).padStart(32, '0');
  if (!/^1*0*$/.test(s))
    throw Error('Invalid mask');
  return s.indexOf('0') < 0 ? 32 : s.indexOf('0');
}
$('#runDiagnostics').onclick = () => {
  const checks = diagnose();
  $('#diagnosticResults').innerHTML = checks.map(c => `<div class="diagnostic-row"><div><strong>${c.name}</strong><div class="field-help">${c.detail}</div></div><strong class="${c.ok ? 'pass' : 'fail'}">${c.ok ? 'PASS' : 'FAIL'}</strong></div>`).join('');
  log(`Diagnostics complete: ${checks.filter(c => !c.ok).length} issue(s) found`, checks.some(c => !c.ok) ? 'red' : 'green');
};
const labs = [{
    name: 'Build your first LAN', level: 'Beginner · 10 min', desc: 'Connect two PCs through a switch, assign IPv4 addresses and verify end-to-end connectivity.', icon: '⌘', run: () => {
      state.devices = [];
      state.links = [];
      addDevice('switch', 330, 170);
      addDevice('pc', 130, 340);
      addDevice('pc', 530, 340);
      state.links = [{
          id: uid(), a: state.devices[0].id, b: state.devices[1].id, down: false
        }, {
          id: uid(), a: state.devices[0].id, b: state.devices[2].id, down: false
        }];
      state.devices[1].ip = '192.168.1.10';
      state.devices[1].mask = '255.255.255.0';
      state.devices[2].ip = '192.168.1.20';
      state.devices[2].mask = '255.255.255.0';
      render();
      switchView('topology');
      toast('LAN lab loaded');
    }
  }, {
    name: 'Configure a default gateway', level: 'Beginner · 15 min', desc: 'Build a routed LAN and configure host gateways to reach a remote network.', icon: '⌁', run: () => {
      seed();
      state.devices[2].ip = '192.168.1.10';
      state.devices[2].gateway = '192.168.1.1';
      state.devices[0].ip = '192.168.1.1';
      render();
      switchView('topology');
      toast('Gateway lab loaded');
    }
  }, {
    name: 'Troubleshoot a broken link', level: 'Intermediate · 12 min', desc: 'Find the failed physical connection, restore the link and retest connectivity.', icon: '⚡', run: () => {
      seed();
      state.links[1].down = true;
      render();
      switchView('topology');
      toast('Fault injected: one link is down');
    }
  }, {
    name: 'Plan a VLSM network', level: 'Intermediate · 20 min', desc: 'Allocate an address block for departments with different host requirements.', icon: '▦', run: () => {
      switchView('subnets');
      $('#exampleSubnet').click();
    }
  }, {
    name: 'Trace a packet path', level: 'Intermediate · 15 min', desc: 'Send ICMP traffic, inspect each hop and identify where a packet is dropped.', icon: '⇢', run: () => {
      seed();
      switchView('traffic');
      toast('Topology ready. Select endpoints and send a packet.');
    }
  }, {
    name: 'Interface failure analysis', level: 'Advanced · 20 min', desc: 'Disable a device interface, observe the impact and recover network connectivity.', icon: '◈', run: () => {
      seed();
      state.devices[0].adminDown = true;
      render();
      switchView('topology');
      toast('Router interface administratively disabled');
    }
  }];
$('#labGrid').innerHTML = labs.map((l, i) => `<article class="lab-card"><div class="lab-icon">${l.icon}</div><h3>${l.name}</h3><p>${l.desc}</p><div class="lab-meta">${l.level}</div><button class="secondary-button" data-lab="${i}">Open lab →</button></article>`).join('');
$$('[data-lab]').forEach(b => b.onclick = () => labs[+b.dataset.lab].run());
$('#themeBtn').onclick = () => {
  const r = document.documentElement;
  const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  r.dataset.theme = dark ? 'light' : 'dark';
  state.theme = r.dataset.theme;
  try {
    localStorage.setItem('packetlab:theme', state.theme);
  }
  catch {
  }
};
$('#helpBtn').onclick = () => showModal('Quick guide', `<div class="modal-body"><p class="field-help">Drag devices from the library onto the topology. Select a device to configure its IPv4 address, subnet mask, gateway or interface state.</p><p class="field-help">Choose the connection tool, then select two devices to create a cable. Select a cable to disconnect or remove it.</p><p class="field-help">Use Subnet planner for VLSM allocation. Use Packet inspector to send simulated traffic and Diagnostics to run configuration checks.</p><p class="field-help">PacketLab models subnet-aware forwarding, static routes, simplified OSPF, VLAN paths and simulated network services. Its IOS-style command line is an educational subset, not Cisco IOS.</p></div>`);
$('#newLabBtn').onclick = () => showModal('Start a new workspace', `<div class="modal-body"><p class="field-help">Choose a clean topology or load the starter network.</p><div style="display:flex;gap:8px;margin-top:14px"><button class="secondary-button" id="modalBlank">Blank topology</button><button class="primary-button" id="modalStarter">Starter network</button></div></div>`);
function showModal(title, html) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  $('#modalBackdrop').hidden = false;
  const a = $('#modalBlank');
  if (a)
    a.onclick = () => {
      state.devices = [];
      state.links = [];
      state.selected = null;
      state.packets = [];
      state.packetCount = 0;
      render();
      $('#modalBackdrop').hidden = true;
    };
  const b = $('#modalStarter');
  if (b)
    b.onclick = () => {
      seed();
      $('#modalBackdrop').hidden = true;
    };
}
$('#modalClose').onclick = () => $('#modalBackdrop').hidden = true;
$('#modalBackdrop').onclick = e => {
  if (e.target.id === 'modalBackdrop')
    $('#modalBackdrop').hidden = true;
};
window.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select'))
    return;
  if (['1', '2', '3', '4'].includes(e.key))
    switchView(({
      1: 'topology', 2: 'subnets', 3: 'traffic', 4: 'devices'
    })[e.key]);
  if (e.key === 'Escape') {
    $('#modalBackdrop').hidden = true;
    state.tool = 'select';
    $('#selectTool').click();
  }
});
seed();
window.PacketLab = {
  state, render, log, toast, device, seed, diagnose, findRoute
};
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.view === 'topology')
      renderCanvas();
  }, 120);
});
