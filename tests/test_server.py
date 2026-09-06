import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer
spec = importlib.util.spec_from_file_location('server', Path(__file__).resolve().parents[1] / 'server.py')
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)

def event():
    t=time.time()*1000
    return dict(id='one',session='session',url='https://example.com/watch',title='测试',platform='example',browser='test',channel='',kind='video',identitySource='test',adStatus='unknown',start=t-4000,end=t,**{'from':0,'to':4},rate=1,duration=100,hidden=False,muted=False)

class Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.app=s.App(self.tmp.name)
    def tearDown(self):
        self.tmp.cleanup()
    def test_idempotent(self):
        e=event();self.app.insert([e]);self.app.insert([e]);self.assertEqual(len(self.app.events()),1)
    def test_atomic_invalid_batch(self):
        e=event();bad={**e,'id':'bad','to':90}
        with self.assertRaises(ValueError):self.app.insert([e,bad])
        self.assertEqual(self.app.events(),[])
    def test_union(self):
        self.assertEqual(s.union_seconds([(0,10),(5,20),(30,40),(3,4)]),30)
    def test_persistence(self):
        self.app.insert([event()]);self.assertEqual(len(s.App(self.tmp.name).events()),1)
    def test_nonfinite(self):
        with self.assertRaises(ValueError):s.validate({**event(),'duration':float('nan')})
    def test_http(self):
        server=ThreadingHTTPServer(('127.0.0.1',0),s.make_handler(self.app,0));port=server.server_port
        server.RequestHandlerClass=s.make_handler(self.app,port)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        def call(path,body=None,token=None,origin=None):
            headers={}
            if token:headers['Authorization']='Bearer '+token
            if origin:headers['Origin']=origin
            return urlopen(Request(f'http://127.0.0.1:{port}'+path,data=json.dumps(body).encode() if body is not None else None,headers=headers))
        try:
            with self.assertRaises(HTTPError) as ctx:call('/api/events')
            self.assertEqual(ctx.exception.code,401)
            with self.assertRaises(HTTPError):call('/api/events',token=self.app.token,origin='https://attacker.example')
            with call('/api/events',[event()],self.app.token,'chrome-extension://test') as r:self.assertEqual(r.status,200)
            with call('/api/events',token=self.app.token) as r:self.assertEqual(len(json.load(r)),1)
            with call('/api/delete',{'confirm':'DELETE ALL'},self.app.token) as r:self.assertEqual(r.status,200)
            self.assertEqual(self.app.events(),[])
        finally:
            server.shutdown();server.server_close();thread.join()

if __name__=='__main__':unittest.main(verbosity=2)
