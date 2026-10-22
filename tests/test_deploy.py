import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('deploy_oss', ROOT / 'scripts/deploy-oss.py')
upload = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upload)


class Bucket:
    def __init__(self, fail=False):
        self.files = []
        self.fail = fail

    def put_object_from_file(self, key, path, headers):
        if self.fail and key.endswith('.js'):
            raise RuntimeError('upload failed')
        self.files.append((key, headers, Path(path).read_bytes()))


class DeploymentTests(unittest.TestCase):
    def test_oss_region_rejects_underscores_with_existing_variable_fix(self):
        with self.assertRaisesRegex(ValueError, "cn-guangzhou.*existing.*OSS_REGION"):
            upload.signing_region('cn_guangzhou')

    def test_oss_region_uses_plain_region_id(self):
        for region in ['cn-guangzhou', 'cn-hangzhou', 'us-west-1', 'ap-southeast-1']:
            self.assertEqual(upload.signing_region(' ' + region + '\n'), region)
        for invalid in ['', 'oss-cn-guangzhou', 'https://oss-cn-guangzhou.aliyuncs.com', 'cn-guangzhou.aliyuncs.com']:
            with self.subTest(region=invalid), self.assertRaises(ValueError):
                upload.signing_region(invalid)

    def test_ssh_upload_needs_no_host_key_secret_and_keeps_password_out_of_arguments(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            bins = work / 'bin'
            bins.mkdir()
            log = work / 'ssh-calls.jsonl'
            mock = bins / 'sshpass'
            mock.write_text('#!/usr/bin/env python3\n'
                            'import json,os,sys\n'
                            'assert os.environ["SSHPASS"]==os.environ["FIXTURE_PASSWORD"]\n'
                            'assert os.environ["SSHPASS"] not in " ".join(sys.argv)\n'
                            'with open(os.environ["FIXTURE_LOG"],"a") as f: f.write(json.dumps(sys.argv[1:])+"\\n")\n'
                            'if os.environ.get("FIXTURE_FAIL")=="scp" and "scp" in sys.argv: sys.exit(1)\n')
            mock.chmod(0o755)
            archive = work / 'knowforge-2.0.0-deploy.tar.gz'
            archive.write_bytes(b'fixture')
            Path(str(archive) + '.sha256').write_text('fixture')
            env = {**os.environ, 'PATH': str(bins) + os.pathsep + os.environ['PATH'],
                   'SSH_HOST': 'fixture.example', 'SSH_USERNAME': 'deploy',
                   'SSH_PASSWORD': 'fixture-password', 'SSH_PORT': '22',
                   'DEPLOY_ARCHIVE': str(archive), 'DEPLOY_UPLOAD_ID': 'mock-upload',
                   'FIXTURE_LOG': str(log), 'FIXTURE_PASSWORD': 'fixture-password'}
            env.pop('SSH_KNOWN_HOSTS', None)
            result = subprocess.run(['bash', 'scripts/deploy-ssh.sh'], cwd=ROOT, env=env,
                                    text=True, capture_output=True, input='', timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            calls = [json.loads(line) for line in log.read_text().splitlines()]
            self.assertEqual(len(calls), 3)
            self.assertTrue(all('StrictHostKeyChecking=accept-new' in call for call in calls))
            self.assertIn('/www/wwwroot/knowforge/.incoming/mock-upload', ' '.join(calls[0]))
            failed = subprocess.run(['bash', 'scripts/deploy-ssh.sh'], cwd=ROOT,
                                    env={**env, 'FIXTURE_FAIL': 'scp'}, text=True,
                                    capture_output=True, input='', timeout=10)
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn('SSH deployment failed during: upload archive', failed.stderr)
            self.assertNotIn(env['SSH_PASSWORD'], failed.stdout + failed.stderr)

    def test_oss_publishes_index_last_and_keeps_worker_on_backend(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'assets').mkdir()
            for name in ['index.html', 'assets/chunk-abc.js', 'favicon.svg', 'runner.js', 'python-runner.js']:
                (root / name).write_text(name)
            bucket = Bucket()
            upload.upload_frontend(bucket, root, '/knowforge/')
            names = [item[0] for item in bucket.files]
            self.assertEqual(names[-1], 'knowforge/index.html')
            self.assertEqual(len(names), 3)
            self.assertNotIn('knowforge/runner.js', names)
            self.assertIn('immutable', bucket.files[0][1]['Cache-Control'])
            self.assertIn('no-cache', bucket.files[-1][1]['Cache-Control'])

    def test_failed_asset_upload_never_publishes_new_html(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'index.html').write_text('new HTML')
            (root / 'asset.js').write_text('broken asset')
            bucket = Bucket(fail=True)
            with self.assertRaises(RuntimeError):
                upload.upload_frontend(bucket, root)
            self.assertFalse(any(key == 'index.html' for key, *_ in bucket.files))

    def run_remote(self, npm_ok=True, restart='', health_ok=True, missing_tool=None):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder).resolve()
            root = work / 'application'
            root.mkdir()
            (root / 'runtime').mkdir()
            database = root / 'runtime/study.sqlite'
            database.write_bytes(b'original user data')
            (root / 'runtime/study.sqlite-wal').write_bytes(b'original WAL')
            (root / '.env').write_text('KEEP_LOCAL_CONFIG=yes')
            (root / 'package.json').write_text('old package')
            (root / 'custom.keep').write_text('local file')
            (root / 'server').mkdir()
            (root / 'server/app.mjs').write_text('old source')
            for directory in ['dist', 'client', 'shared', 'docs', 'examples']:
                (root / directory).mkdir()
                (root / directory / 'legacy-file').write_text('old full-stack artifact')
            (root / 'node_modules').mkdir()
            (root / 'node_modules/old-package').write_text('stale dependency')
            incoming = root / '.incoming/test-upload'
            incoming.mkdir(parents=True)
            archive_name = 'knowforge-2.0.0-deploy.tar.gz'
            archive = incoming / archive_name
            with tarfile.open(archive, 'w:gz') as bundle:
                for name in ['knowforge', 'knowforge/runtime', 'knowforge/server', 'knowforge/resources', 'knowforge/data']:
                    item = tarfile.TarInfo(name)
                    item.type = tarfile.DIRTYPE
                    item.mode = 0o755
                    bundle.addfile(item)
                payload = b'{"name":"knowforge"}'
                item = tarfile.TarInfo('knowforge/package.json')
                item.size = len(payload)
                bundle.addfile(item, io.BytesIO(payload))
                for name, body in [('server/index.mjs', b'compiled service'), ('resources/runner.js', b'worker'), ('data/catalog.json', b'{}')]:
                    item = tarfile.TarInfo('knowforge/' + name)
                    item.size = len(body)
                    bundle.addfile(item, io.BytesIO(body))
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            (incoming / (archive_name + '.sha256')).write_text(digest + '  ' + archive_name + '\n')
            (incoming / 'restart-command').write_text(restart)
            bins = work / 'bin'
            bins.mkdir()
            commands = {
                'node': '#!/bin/sh\nexit 0\n',
                'npm': '#!/bin/sh\nmkdir -p node_modules\nprintf new > node_modules/new-package\nexit ' + ('0' if npm_ok else '1') + '\n',
                'curl': '#!/bin/sh\nexit ' + ('0' if health_ok else '1') + '\n',
                'sleep': '#!/bin/sh\nexit 0\n',
                'sha256sum': '#!/usr/bin/env python3\nimport hashlib,pathlib,sys\nparts=pathlib.Path(sys.argv[-1]).read_text().split()\nassert hashlib.sha256(pathlib.Path(parts[1]).read_bytes()).hexdigest()==parts[0]\n',
            }
            for name, content in commands.items():
                path = bins / name
                path.write_text(content)
                path.chmod(0o755)
            script = (ROOT / 'scripts/deploy-remote.sh').read_text()
            self.assertEqual(script.count('readonly root=/www/wwwroot/knowforge'), 1)
            script = script.replace('readonly root=/www/wwwroot/knowforge', 'readonly root=' + str(root))
            if missing_tool:
                script = f'''command() {{
  if [[ "${{1:-}}" == -v && "${{2:-}}" == "{missing_tool}" ]]; then return 1; fi
  builtin command "$@"
}}
''' + script
            env = {**os.environ, 'PATH': str(bins) + os.pathsep + os.environ['PATH']}
            result = subprocess.run(['bash', '-s', '--', 'test-upload', archive_name],
                                    input=script, text=True, capture_output=True, env=env, timeout=15)
            self.assertEqual(database.read_bytes(), b'original user data')
            self.assertEqual((root / 'runtime/study.sqlite-wal').read_bytes(), b'original WAL')
            self.assertEqual((root / '.env').read_text(), 'KEEP_LOCAL_CONFIG=yes')
            self.assertEqual((root / 'custom.keep').read_text(), 'local file')
            self.assertFalse((root / 'runtime').is_symlink())
            self.assertFalse(incoming.exists())
            self.assertFalse((root / 'current').exists())
            self.assertFalse((root / 'releases').exists())
            if npm_ok and not missing_tool:
                self.assertEqual((root / 'server/index.mjs').read_text(), 'compiled service')
                self.assertFalse((root / 'server/app.mjs').exists())
                for directory in ['dist', 'client', 'shared', 'docs', 'examples']:
                    self.assertFalse((root / directory).exists())
                self.assertEqual((root / 'package.json').read_text(), '{"name":"knowforge"}')
                self.assertFalse((root / 'node_modules/old-package').exists())
                self.assertEqual((root / 'node_modules/new-package').read_text(), 'new')
            else:
                self.assertEqual((root / 'server/app.mjs').read_text(), 'old source')
                self.assertTrue((root / 'dist/legacy-file').exists())
                self.assertEqual((root / 'package.json').read_text(), 'old package')
                self.assertTrue((root / 'node_modules/old-package').exists())
            return result

    def test_missing_node_or_npm_reports_noninteractive_path_and_preserves_app(self):
        for tool in ['node', 'npm']:
            with self.subTest(tool=tool):
                result = self.run_remote(missing_tool=tool)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('Missing server command: ' + tool, result.stderr)
                self.assertIn('non-interactive SSH PATH', result.stderr)

    def test_remote_upload_updates_root_and_preserves_data(self):
        result = self.run_remote()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('service was not restarted', result.stdout)

    def test_install_failure_leaves_existing_application_unchanged(self):
        result = self.run_remote(npm_ok=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Remote deployment failed during: install production dependencies', result.stderr)

    def test_restart_failure_is_reported_without_losing_data(self):
        result = self.run_remote(restart='exit 1\n')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('service restart failed', result.stderr)

    def test_successful_restart_runs_from_application_root(self):
        self.assertEqual(self.run_remote(restart='test -f package.json && test -d node_modules\n').returncode, 0)

    def test_failed_health_check_is_reported_without_losing_data(self):
        result = self.run_remote(restart='exit 0\n', health_ok=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('health check failed', result.stderr)


if __name__ == '__main__':
    unittest.main()
