# PacketLab

A network simulator that runs in the browser, built for CCNA-style practice. Build a topology, plan subnets, trace packets hop by hop, configure devices from an IOS-style command line, break things and diagnose them.

**Open it:** https://siddhanth-mani.github.io/packetlab/

No account, no server and no install. Everything runs on your device, and projects are saved in your browser.

## What you can do

**Topology.** Add routers, switches, PCs and servers, drag them around, and connect them with the link tool. Click a device to edit its name, IPv4 address, mask, gateway and interface state. Click a link to take it down. The layout scales to fit the canvas on smaller screens.

**Subnet planner.** Enter a parent network and a list of host requirements. PacketLab allocates VLSM blocks largest first, with no overlaps. It shows network, first host, last host, broadcast and usable count for each block. If the space runs out, it says which requirement didn't fit.

**Packet inspector.** Send ICMP, ARP, UDP or TCP between two devices. Each packet shows its path, what each hop did (MAC lookup, route lookup, ACL drop) and its simulated headers. Failed packets say why they failed: no physical path, interface down, ACL deny, ARP outside the broadcast domain.

**Command line.** Each device has an IOS-style prompt with user, privileged, config, interface and router modes:

```text
Router-01> enable
Router-01# configure terminal
Router-01(config)# interface Gi0/1
Router-01(config-if)# ip address 10.0.0.1 255.255.255.0
Router-01(config-if)# exit
Router-01(config)# ip route 10.1.0.0/16 10.0.0.2
Router-01(config)# router ospf 1
Router-01(config-router)# network 10.0.0.0/24 area 0
Router-01(config-router)# end
Router-01# show ip route
Router-01# show running-config
```

It also supports `show ip interface brief`, `show arp`, `show vlan brief`, `show mac address-table`, `vlan`, `switchport access vlan`, `switchport mode trunk`, `shutdown`, `no shutdown`, `clear arp` and `nslookup`. Type `help` for the full list.

**Network services.** A DHCP pool with lease requests, DNS A records (used by `nslookup`), NAT/PAT shown in packet headers, and ordered permit/deny ACL rules applied to generated traffic.

**Labs and diagnostics.** Six guided labs (first LAN, default gateway, broken link, VLSM plan, packet tracing, interface failure). Diagnostics check interface state, cabling, addressing, duplicate IPs, static route next hops, OSPF statements and VLAN IDs.

**Projects.** Save up to 20 projects in the browser, export or import them as JSON, and export a plain-text network report. Imported files are validated before anything is loaded.

**CCNA quiz.** Ten scored questions on subnetting, switching, routing, ARP, OSPF, NAT, DHCP and troubleshooting. After each answer it highlights the correct option and explains it.

The layout works on phones (the sidebar becomes a bottom tab bar) and follows your system's light or dark setting. There is also a manual switch.

## What it is not

PacketLab is a teaching model, not a packet-accurate emulator, and its command line is not Cisco IOS. It does not send real frames or implement full TCP, OSPF or 802.1Q/STP state machines. OSPF is modelled as router adjacency plus advertised networks. NAT is shown in packet metadata rather than kept in a translation table. ACLs filter by source network and protocol. These limits are stated so nobody mistakes the simulation for real equipment behaviour.

## Run it locally

The app uses ES modules, so serve the folder instead of opening the file directly:

```text
python -m http.server 8000     # then open http://localhost:8000
```

There is no build step and nothing to install.

## Tests

```text
npm test        # Node 18 or newer
```

The tests cover the addressing engine in `engine.js`:

- IPv4 conversion at boundary values;
- rejecting bad octets and bad CIDR syntax;
- /31 and /32 edge cases;
- VLSM ordering, overlap and exhaustion;
- path finding with and without failed links.

GitHub Actions runs them on every push.

## Files

| File | What it does |
| --- | --- |
| `index.html` | All views. |
| `styles.css` | Layout and light/dark themes. |
| `engine.js` | IPv4, CIDR, VLSM and path-finding logic, with no DOM code. |
| `app.js` | Topology canvas, inspector, subnet planner, packet inspector, device manager, labs, diagnostics. |
| `advanced.js` | CLI, routing model, services, projects and quiz. |
| `tests/engine.test.js` | Unit tests for `engine.js`. |

User-supplied text (device names, DNS records, project names, imported files) is HTML-escaped before it is rendered.

## Licence

MIT
