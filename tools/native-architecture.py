"""Bounded native-core replay with loopback-only SOCKS/DNS/HTTP/TLS origins.

Requires an OpenSSL executable for an ephemeral local test certificate.
No real subscriptions, Internet targets, TUN, system
routes, or live controller. Source configs come from prepare-native-audit.cjs.
DNS transports are replaced with a local responder: this checks DNS families,
not production DoH/DoT reachability or per-flow DNS transport affinity.
"""
import argparse
import base64
import copy
import datetime
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import select
import socket
import socketserver
import ssl
import struct
import subprocess
import tempfile
import threading
import time
import traceback
import urllib.request
import shutil


def make_certificate(home, openssl=None):
    """Generate a short-lived, privately trusted local certificate; no OS store changes."""
    executable = openssl or shutil.which('openssl')
    if not executable:
        candidate = Path('C:/Program Files/Git/usr/bin/openssl.exe')
        executable = str(candidate) if candidate.is_file() else None
    if not executable:
        raise RuntimeError('OpenSSL is required; pass --openssl PATH (no global installation needed)')
    subprocess.run([str(executable), 'req', '-x509', '-newkey', 'rsa:2048',
                    '-nodes', '-keyout', str(home / 'key.pem'), '-out', str(home / 'cert.pem'),
                    '-days', '1', '-subj', '/CN=audit-origin.test',
                    '-addext', 'subjectAltName=DNS:audit-origin.test'],
                   check=True, capture_output=True, timeout=15)


def exact(sock, count):
    data = b''
    while len(data) < count:
        chunk = sock.recv(count - len(data))
        if not chunk:
            raise EOFError('socket closed')
        data += chunk
    return data


def address(sock, atyp):
    if atyp == 1:
        host = socket.inet_ntoa(exact(sock, 4))
    elif atyp == 3:
        host = exact(sock, exact(sock, 1)[0]).decode()
    elif atyp == 4:
        host = socket.inet_ntop(socket.AF_INET6, exact(sock, 16))
    else:
        raise ValueError('invalid address type')
    return host, struct.unpack('!H', exact(sock, 2))[0]


class TCP(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    block_on_close = False


class UDP(socketserver.ThreadingUDPServer):
    allow_reuse_address = True
    daemon_threads = True
    block_on_close = False


class Origin(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *_):
        pass

    def do_GET(self):
        self.server.hits.append(self.path)
        if self.path == '/ws':
            key = self.headers['Sec-WebSocket-Key']
            accept = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
            self.send_response(101); self.send_header('Upgrade', 'websocket'); self.send_header('Connection', 'Upgrade'); self.send_header('Sec-WebSocket-Accept', accept); self.end_headers(); self.wfile.flush()
            first = self.rfile.read(2); length = first[1] & 127
            mask = self.rfile.read(4); payload = self.rfile.read(length)
            decoded = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            self.wfile.write(bytes([0x81, len(decoded)]) + decoded); self.wfile.flush(); self.close_connection = True
        else:
            chunks = [b'data: one\n\n', b'data: two\n\n', b'data: done\n\n'] if self.path == '/sse' else [b'AUDIT_OK']
            self.send_response(200); self.send_header('Content-Length', str(sum(map(len, chunks)))); self.send_header('Connection', 'close')
            if self.path == '/sse':
                self.send_header('Content-Type', 'text/event-stream')
            self.end_headers()
            for chunk in chunks:
                self.wfile.write(chunk); self.wfile.flush(); time.sleep(0.02)
            self.close_connection = True


class DNSHandler(socketserver.BaseRequestHandler):
    def handle(self):
        packet, sock = self.request
        pos = 12
        while packet[pos]:
            pos += packet[pos] + 1
        pos += 1
        qtype = struct.unpack('!H', packet[pos:pos+2])[0]
        end = pos + 4
        data = socket.inet_aton('127.0.0.1') if qtype == 1 else socket.inet_pton(socket.AF_INET6, '::1') if qtype == 28 else b''
        count = int(bool(data))
        response = packet[:2] + struct.pack('!HHHHH', 0x8180, 1, count, 0, 0) + packet[12:end]
        if data:
            response += b'\xc0\x0c' + struct.pack('!HHIH', qtype, 1, 0, len(data)) + data
        sock.sendto(response, self.client_address)


class ProxyUDP(socketserver.BaseRequestHandler):
    def handle(self):
        packet, sock = self.request
        if len(packet) < 8 or packet[:3] != b'\x00\x00\x00':
            return
        pos = 4 + (4 if packet[3] == 1 else 16 if packet[3] == 4 else 1 + packet[4]) + 2
        self.server.events.append('UDP')
        sock.sendto(packet[:pos] + b'ACK:' + packet[pos:], self.client_address)


class ProxyTCP(socketserver.BaseRequestHandler):
    def handle(self):
        upstream = None
        try:
            self.request.settimeout(5)
            head = exact(self.request, 2); exact(self.request, head[1]); self.request.sendall(b'\x05\x00')
            version, cmd, reserved, atyp = exact(self.request, 4)
            host, port = address(self.request, atyp)
            if cmd == 3:
                self.server.events.append(('UDP_ASSOCIATE', host, port))
                self.request.sendall(b'\x05\x00\x00\x01\x7f\x00\x00\x01' + struct.pack('!H', self.server.udp.server_address[1]))
                while self.request.recv(32):
                    pass
                return
            if cmd != 1:
                raise ValueError('unsupported SOCKS command')
            self.server.events.append(('TCP', host, port))
            destination = self.server.tls_port if host == 'audit-origin.test' and port == self.server.tls_port else self.server.http_port
            upstream = socket.create_connection(('127.0.0.1', destination), timeout=3)
            self.request.sendall(b'\x05\x00\x00\x01\x7f\x00\x00\x01' + struct.pack('!H', destination))
            while True:
                ready, _, _ = select.select([self.request, upstream], [], [], 5)
                if not ready:
                    break
                for sock in ready:
                    data = sock.recv(16384)
                    if not data:
                        return
                    (upstream if sock is self.request else self.request).sendall(data)
        except (OSError, EOFError, ValueError):
            pass
        finally:
            if upstream is not None:
                upstream.close()


def unused_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0)); return s.getsockname()[1]


def headers(sock):
    data = b''
    while not data.endswith(b'\r\n\r\n') and len(data) < 32768:
        data += exact(sock, 1)
    return data


def tunnel(mixed, host, port):
    sock = socket.create_connection(('127.0.0.1', mixed), timeout=3)
    sock.sendall(('CONNECT %s:%d HTTP/1.1\r\nHost: %s:%d\r\n\r\n' % (host, port, host, port)).encode())
    if b' 200 ' not in headers(sock).split(b'\r\n', 1)[0]:
        sock.close(); raise OSError('CONNECT rejected')
    return sock


def http_request(mixed, host, port, path='/ping', context=None):
    raw = tunnel(mixed, host, port)
    with context.wrap_socket(raw, server_hostname=host) if context else raw as sock:
        sock.sendall(('GET '+path+' HTTP/1.1\r\nHost: '+host+'\r\nConnection: close\r\n\r\n').encode())
        head = headers(sock)
        length = int(next(line.split(b':', 1)[1].strip() for line in head.split(b'\r\n') if line.lower().startswith(b'content-length:')))
        return exact(sock, length)


def dns_answers(port, host, qtype):
    name = b''.join(bytes([len(part)])+part.encode() for part in host.split('.'))+b'\x00'
    request = b'\x12\x34'+struct.pack('!HHHHH', 0x0100, 1, 0, 0, 0)+name+struct.pack('!HH', qtype, 1)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.settimeout(3); sock.sendto(request, ('127.0.0.1', port)); data = sock.recv(4096)
    count = struct.unpack('!H', data[6:8])[0]; pos = 12+len(name)+4; found=[]
    for _ in range(count):
        if data[pos] & 0xc0:
            pos += 2
        else:
            while data[pos]: pos += data[pos]+1
            pos += 1
        typ, _, _, size = struct.unpack('!HHIH', data[pos:pos+10]); pos += 10
        if typ == 1: found.append(socket.inet_ntoa(data[pos:pos+size]))
        if typ == 28: found.append(socket.inet_ntop(socket.AF_INET6, data[pos:pos+size]))
        pos += size
    return found


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--core', required=True, type=Path); parser.add_argument('--plan', required=True, type=Path); parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--openssl', type=Path)
    parser.add_argument('--case', action='append', help='Run only named cases; repeatable')
    args=parser.parse_args(); plan=json.loads(args.plan.read_text(encoding='utf-8')); rows=[]
    chosen=[c for c in plan['cases'] if (c['name'] in args.case if args.case else
        ((c['platform']=='windows' and c['mode'] in ('dual-stack','ipv4-local','ipv4-only')) or
         (c['platform']=='android' and c['mode']=='auto')))]
    if not chosen:
        parser.error('No matching native cases')
    with tempfile.TemporaryDirectory(prefix='RouteWeaver-native-replay-') as directory:
        home=Path(directory)
        make_certificate(home, args.openssl)
        tls_context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); tls_context.load_cert_chain(home/'cert.pem',home/'key.pem')
        client_context=ssl.create_default_context(cafile=str(home/'cert.pem'))
        servers=[]; threads=[]
        def serve(server):
            servers.append(server); thread=threading.Thread(target=server.serve_forever,kwargs={'poll_interval':0.05},daemon=True); thread.start(); threads.append(thread); return server
        http=ThreadingHTTPServer(('127.0.0.1',0),Origin); http.hits=[]; serve(http)
        tls=ThreadingHTTPServer(('127.0.0.1',0),Origin); tls.hits=[]; tls.socket=tls_context.wrap_socket(tls.socket,server_side=True); serve(tls)
        resolver=serve(UDP(('127.0.0.1',0),DNSHandler)); proxies={}
        for label in ('A','B'):
            udp=UDP(('127.0.0.1',0),ProxyUDP); udp.events=[]; serve(udp)
            proxy=TCP(('127.0.0.1',0),ProxyTCP); proxy.events=[]; proxy.udp=udp; proxy.http_port=http.server_address[1]; proxy.tls_port=tls.server_address[1]; serve(proxy); proxies[label]=proxy
        try:
            for case in chosen:
                checks=[]; process=None; mixed=unused_port(); controller=unused_port(); dns_port=unused_port(); cfg=json.loads(Path(case['configPath']).read_text(encoding='utf-8'))
                def check(name, fn):
                    try:
                        fn(); checks.append({'name':name,'status':'PASS'})
                    except Exception as error:
                        checks.append({'name':name,'status':'FAIL','error':str(error)[:600] or type(error).__name__})
                def expect(condition, message):
                    if not condition: raise AssertionError(message)
                for node in cfg['proxies']:
                    node['port']=proxies[node['name'][-1]].server_address[1] if node['name'] in ('Audit-A','Audit-B') else unused_port()
                # Respect core filesystem sandboxing: copy only approved local rule
                # fixtures into this run's home instead of allowing external paths.
                fixture_root = Path(plan['home']).resolve()
                for provider in cfg['rule-providers'].values():
                    if provider.get('type') == 'file':
                        original = (fixture_root / provider['path']).resolve()
                        if not original.is_relative_to(fixture_root):
                            raise ValueError('Rule fixture escapes isolated plan directory')
                        relative = original.relative_to(fixture_root)
                        target = home / relative
                        target.parent.mkdir(parents=True, exist_ok=True)
                        if not target.exists():
                            shutil.copyfile(original, target)
                        provider['path'] = str(target)
                cfg['mixed-port']=mixed; cfg['external-controller']='127.0.0.1:'+str(controller); cfg['log-level']='info'; cfg['geo-auto-update']=False
                ns=['udp://127.0.0.1:'+str(resolver.server_address[1])]
                for field in ('nameserver','proxy-server-nameserver','direct-nameserver','default-nameserver'): cfg['dns'][field]=ns
                cfg['dns']['nameserver-policy']={key:ns for key in cfg['dns']['nameserver-policy']}; cfg['dns']['listen']='127.0.0.1:'+str(dns_port)
                cfg['rules']=['DOMAIN,audit-origin.test,OpenAI 服务','DOMAIN,audit-origin.test,REJECT']+cfg['rules']
                source=home/(case['name']+'.json'); source.write_text(json.dumps(cfg),encoding='utf-8')
                opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
                def select_node(group,node):
                    from urllib.parse import quote
                    req=urllib.request.Request('http://127.0.0.1:'+str(controller)+'/proxies/'+quote(group,safe=''),data=json.dumps({'name':node}).encode(),headers={'Authorization':'Bearer audit-loopback-only','Content-Type':'application/json'},method='PUT')
                    with opener.open(req,timeout=2) as response: assert response.status==204
                try:
                    log_path = home / (case['name'] + '.log')
                    with log_path.open('wb') as log:
                        process=subprocess.Popen([str(args.core.resolve()),'-d',str(home),'-f',str(source)],
                            stdout=log,stderr=subprocess.STDOUT,
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                    for _ in range(50):
                        if process.poll() is not None:
                            raise RuntimeError('Core exited during startup; inspect coreLogTail')
                        try:
                            with socket.create_connection(('127.0.0.1',controller),timeout=0.1): break
                        except OSError: time.sleep(0.05)
                    select_node('高纯净度AI用','Audit-A'); select_node('高网速视频用','Audit-B'); select_node('漏网之鱼','Audit-B'); select_node('公共基础服务','Audit-A'); select_node('OpenAI 服务','Audit-A')
                    for name,host,label in [('literal-cf-fallback','1.1.1.1','B'),('cloudflare-shared','www.cloudflare.com','A'),('openai-company','chatgpt.com','A')]:
                        def route(host=host,label=label):
                            before=len(proxies[label].events); expect(http_request(mixed,host,80)==b'AUDIT_OK','HTTP body mismatch'); expect(('TCP',host,80) in proxies[label].events[before:],'wrong outbound node')
                        check(name,route)
                    check('tls-sse-stream',lambda:expect(http_request(mixed,'audit-origin.test',tls.server_address[1],'/sse',client_context)==b'data: one\n\ndata: two\n\ndata: done\n\n','stream lost or reordered'))
                    def websocket():
                        with client_context.wrap_socket(tunnel(mixed,'audit-origin.test',tls.server_address[1]),server_hostname='audit-origin.test') as sock:
                            sock.sendall(b'GET /ws HTTP/1.1\r\nHost: audit-origin.test\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n'); expect(b' 101 ' in headers(sock),'upgrade failed'); payload=b'audit-echo'; mask=b'1234'; sock.sendall(bytes([0x81,0x80|len(payload)])+mask+bytes(v^mask[i%4] for i,v in enumerate(payload))); frame=exact(sock,2); expect(exact(sock,frame[1])==payload,'websocket echo corrupted')
                    check('tls-websocket-upgrade-and-echo',websocket)
                    check('dns-fake-ip-A',lambda:expect(any(ip.startswith('198.18.') for ip in dns_answers(dns_port,'audit-client.chatgpt.com',1)),'A not Fake-IP'))
                    check('dns-AAAA-family',lambda:expect(bool(dns_answers(dns_port,'audit-client.chatgpt.com',28))==(case['mode'] in ('auto','dual-stack')),'AAAA family contract differs'))
                    check('api-real-answer-versus-fake-ip',lambda:expect(dns_answers(dns_port,'api.openai.com',1)[0].startswith('198.18.') if case['mode'] in ('ipv4-local','ipv4-only') else dns_answers(dns_port,'api.openai.com',1)==['127.0.0.1'],'API answer mode differs'))
                    def udp(should_succeed):
                        with socket.create_connection(('127.0.0.1',mixed),timeout=2) as tcp, socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as sock:
                            tcp.sendall(b'\x05\x01\x00'); expect(exact(tcp,2)==b'\x05\x00','SOCKS greeting'); tcp.sendall(b'\x05\x03\x00\x01\x00\x00\x00\x00\x00\x00'); h=exact(tcp,4); _,port=address(tcp,h[3]); host=b'chatgpt.com'; packet=b'\x00\x00\x00\x03'+bytes([len(host)])+host+struct.pack('!H',443)+b'PING'; sock.settimeout(0.8); sock.sendto(packet,('127.0.0.1',port))
                            try: result=sock.recv(4096)
                            except socket.timeout: result=b''
                            expect(result.endswith(b'ACK:PING') if should_succeed else not result,'UDP outcome differs')
                    check('company-UDP-roundtrip',lambda:udp(True)); select_node('OpenAI 服务','Audit-B'); check('unsupported-UDP-fails-closed',lambda:udp(False))
                    select_node('OpenAI 服务','Audit-Broken')
                    def node_failure():
                        before=len(http.hits); failed=False
                        try: http_request(mixed,'audit-origin.test',http.server_address[1])
                        except (OSError,EOFError,StopIteration): failed=True
                        expect(failed and len(http.hits)==before,'unavailable node silently fell back')
                    check('node-unavailable-no-direct-fallback',node_failure)
                    select_node('OpenAI 服务','Audit-A'); check('manual-node-recovery',lambda:expect(http_request(mixed,'audit-origin.test',http.server_address[1])==b'AUDIT_OK','recovery failed'))
                    def blocked_doh():
                        before=sum(len(p.events) for p in proxies.values()); failed=False
                        try: http_request(mixed,'one.one.one.one',80)
                        except (OSError,EOFError,StopIteration): failed=True
                        expect(failed and before==sum(len(p.events) for p in proxies.values()),'application DoH bypass guard changed')
                    check('application-doh-domain-stays-blocked',blocked_doh)
                except Exception as error:
                    checks.append({'name':'native-runtime-setup','status':'FAIL','error':type(error).__name__+': '+str(error)[:600]})
                finally:
                    if process is not None and process.poll() is None:
                        process.terminate()
                        try: process.wait(timeout=3)
                        except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=3)
                rows.append({'case':case['name'],'source':case['source'],'sourceSHA256':case['sourceSHA256'],'isolatedInputSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'checks':checks,'childExited':process is None or process.poll() is not None,
                    'coreLogTail': log_path.read_text(encoding='utf-8', errors='replace')[-12000:] if log_path.exists() else ''})
        finally:
            for server in reversed(servers): server.shutdown(); server.server_close()
            for thread in threads: thread.join(timeout=2)
    passed=sum(c['status']=='PASS' for row in rows for c in row['checks']); failed=sum(c['status']!='PASS' for row in rows for c in row['checks'])
    report={'revision':'architecture-audit-r1','flavor':plan['flavor'],'scope':'REAL_WINDOWS_NATIVE_CORE_WITH_SYNTHETIC_LOOPBACK_UPSTREAMS_NOT_MOBILE_DEVICE_OR_PUBLIC_AI_AUTH','coreSHA256':hashlib.sha256(args.core.read_bytes()).hexdigest(),'DNSAffinityTransport':'NOT_VERIFIED_DNS_UPSTREAM_REPLACED_FOR_ISOLATION','status':'PASS' if not failed else 'FAIL','passed':passed,'failed':failed,'cases':rows,'temporaryDirectoryRemoved':not Path(directory).exists(),'liveClientTouched':False}
    args.output.parent.mkdir(parents=True,exist_ok=True); args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); print(json.dumps({'status':report['status'],'passed':passed,'failed':failed,'failures':[{'case':row['case'],**c} for row in rows for c in row['checks'] if c['status']!='PASS']},ensure_ascii=False)); return int(bool(failed))


if __name__=='__main__':
    raise SystemExit(main())
