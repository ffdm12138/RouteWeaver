"""Private, unique IPC host for an isolated FlClashCore child; never the live pipe."""
import ctypes as c
from ctypes import wintypes as w
import json
import queue
import struct
import subprocess
import threading
import time
import uuid


class StockCore:
    def __init__(self, executable, home):
        self.home = home
        self.k = c.WinDLL('kernel32', use_last_error=True)
        self.k.CreateNamedPipeW.argtypes = [w.LPCWSTR, w.DWORD, w.DWORD, w.DWORD, w.DWORD, w.DWORD, w.DWORD, c.c_void_p]
        self.k.CreateNamedPipeW.restype = w.HANDLE
        self.k.ConnectNamedPipe.argtypes = [w.HANDLE, c.c_void_p]
        self.k.ReadFile.argtypes = [w.HANDLE, c.c_void_p, w.DWORD, c.POINTER(w.DWORD), c.c_void_p]
        self.k.WriteFile.argtypes = self.k.ReadFile.argtypes
        self.k.PeekNamedPipe.argtypes = [w.HANDLE, c.c_void_p, w.DWORD, c.c_void_p, c.POINTER(w.DWORD), c.c_void_p]
        self.k.CloseHandle.argtypes = [w.HANDLE]
        self.pipe = r'\\.\pipe\routeweaver-audit-' + uuid.uuid4().hex
        self.handle = self.k.CreateNamedPipeW(self.pipe, 3, 0, 1, 65536, 65536, 0, None)
        if self.handle == w.HANDLE(-1).value:
            raise c.WinError(c.get_last_error())
        self.log = (home / 'core.log').open('wb')
        self.process = subprocess.Popen([str(executable), self.pipe], cwd=home, stdout=self.log,
                                        stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
        (home / 'child.json').write_text(json.dumps({'pid': self.process.pid, 'pipe': self.pipe}))
        self.inbox = queue.Queue()
        self.thread = threading.Thread(target=self._read, daemon=True)
        self.thread.start()
        self.serial = 0
        try:
            self.call('core.init', {'home-dir': str(home), 'version': 0})
        except Exception:
            self.close()
            raise

    def _bytes(self, n):
        result = bytearray()
        while len(result) < n:
            available = w.DWORD()
            if not self.k.PeekNamedPipe(self.handle, None, 0, None, c.byref(available), None):
                raise EOFError('isolated IPC pipe closed')
            if not available.value:
                if self.process.poll() is not None:
                    raise EOFError('isolated child exited')
                time.sleep(0.005)
                continue
            buffer = c.create_string_buffer(min(n - len(result), available.value))
            got = w.DWORD()
            if not self.k.ReadFile(self.handle, buffer, len(buffer), c.byref(got), None) or not got.value:
                raise EOFError('isolated IPC child disconnected')
            result.extend(buffer.raw[:got.value])
        return result

    def _read(self):
        try:
            if not self.k.ConnectNamedPipe(self.handle, None) and c.get_last_error() != 535:
                raise c.WinError(c.get_last_error())
            self.inbox.put({'connected': True})
            while True:
                size = struct.unpack('<I', self._bytes(4))[0]
                if size > 32 * 1024 * 1024:
                    raise ValueError('oversized isolated IPC response')
                self.inbox.put(json.loads(self._bytes(size)))
        except Exception as error:
            self.inbox.put(error)

    def call(self, method, arguments=None, timeout=30):
        if not self.serial:
            ready = self.inbox.get(timeout=timeout)
            if isinstance(ready, Exception):
                raise ready
            assert ready.get('connected')
        self.serial += 1
        ident = str(self.serial)
        body = json.dumps({'id': ident, 'method': method, 'arguments': arguments or {}}).encode()
        body = struct.pack('<I', len(body)) + body
        written = w.DWORD()
        if not self.k.WriteFile(self.handle, body, len(body), c.byref(written), None) or written.value != len(body):
            raise c.WinError(c.get_last_error())
        while True:
            response = self.inbox.get(timeout=timeout)
            if isinstance(response, Exception):
                raise response
            if response.get('id') != ident:
                continue
            if response.get('error'):
                raise RuntimeError(json.dumps(response['error'], ensure_ascii=False))
            if response.get('file'):
                raise ValueError('unexpected spilled IPC response')
            return response.get('result')

    def close(self):
        # End only our child before closing a handle with a blocking reader.
        if self.process.poll() is None:
            self.process.terminate()
            self.process.wait(timeout=5)
        self.thread.join(timeout=2)
        self.k.CloseHandle(self.handle)
        self.log.close()


class QuickJS:
    """Public flutter_js ffi.dart signatures; values are bridge-owned pointers."""
    def __init__(self, library):
        self.dll = c.CDLL(str(library))
        p = c.c_void_p
        for name, result, args in [
            ('jsNewRuntime', p, [p, c.c_int64]), ('jsNewContext', p, [p]),
            ('jsEval', p, [p, c.c_char_p, c.c_size_t, c.c_char_p, c.c_int]),
            ('jsToCString', p, [p, p]), ('jsFreeCString', None, [p, p]),
            ('jsFreeValue', None, [p, p, c.c_int]), ('jsFreeContext', None, [p]),
            ('jsFreeRuntime', None, [p]), ('jsIsException', c.c_int, [p]),
            ('jsGetException', p, [p]),
        ]:
            function = getattr(self.dll, name)
            function.restype, function.argtypes = result, args

    def evaluate(self, source):
        d = self.dll
        rt = d.jsNewRuntime(None, 0)
        ctx = d.jsNewContext(rt)
        code = source.encode('utf-8')
        value = d.jsEval(ctx, code, len(code), b'routeweaver-audit.js', 0)
        failed = d.jsIsException(value)
        if failed:
            d.jsFreeValue(ctx, value, 1)
            value = d.jsGetException(ctx)
        text = d.jsToCString(ctx, value)
        answer = c.string_at(text).decode('utf-8')
        d.jsFreeCString(ctx, text)
        d.jsFreeValue(ctx, value, 1)
        d.jsFreeContext(ctx)
        d.jsFreeRuntime(rt)
        if failed:
            raise RuntimeError(answer)
        return answer
