import importlib.util
import io
import json
from pathlib import Path
import struct
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('native_host', Path(__file__).resolve().parents[1] / 'scripts' / 'native_host.py')
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


class Tests(unittest.TestCase):
    def test_exact_action(self):
        body = json.dumps({'action': 'start'}).encode()
        self.assertEqual(host.read_message(io.BytesIO(struct.pack('<I', len(body)) + body)), {'action': 'start'})

    def test_rejects_commands_and_parameters(self):
        for value in [{'action': 'stop'}, {'action': 'start', 'command': 'anything'}, [], None]:
            body = json.dumps(value).encode()
            with self.assertRaises(ValueError):
                host.read_message(io.BytesIO(struct.pack('<I', len(body)) + body))

    def test_bad_framing(self):
        for body in [b'', b'123', struct.pack('<I', 4097), struct.pack('<I', 0), struct.pack('<I', 50) + b'{}']:
            with self.assertRaises(ValueError):
                host.read_message(io.BytesIO(body))

    def test_chromium_path_normalization(self):
        self.assertEqual(host.chromium_id('c:\\Users\\name\\neo'), host.chromium_id('C:\\Users\\name\\neo'))
        self.assertRegex(host.chromium_id('C:\\中文\\neo'), '^[a-p]{32}$')

    def test_reuses_healthy_service(self):
        with patch.object(host, 'service_token', return_value='paired'), patch.object(host.subprocess, 'Popen') as spawn:
            self.assertEqual(host.start_service(), {'ok': True, 'token': 'paired'})
            spawn.assert_not_called()


if __name__ == '__main__':
    unittest.main()
