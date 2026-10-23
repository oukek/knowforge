import importlib.util
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

path=Path(__file__).resolve().parents[2]/'scripts/collect-interview-sources.py'
spec=importlib.util.spec_from_file_location('collector',path)
collector=importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

class CollectorTests(unittest.TestCase):
    def test_visible_text_omits_scripts(self):
        parser=collector.VisibleText()
        parser.feed('<title>标题</title><style>secret</style><script>hidden()</script><p>公开内容</p>')
        self.assertEqual(parser.title,['标题'])
        self.assertNotIn('hidden()',''.join(parser.parts))
        self.assertIn('公开内容',parser.parts)
    def test_robots_disallow_prevents_page_request(self):
        source={'id':'s','url':'https://example.test/private'}
        with patch.object(collector,'fetch',return_value=(200,'User-agent: *\nDisallow: /private')) as fetch:
            rows=collector.collect([source],delay=0)
        self.assertEqual(fetch.call_count,1)
        self.assertEqual(rows[0]['status'],'robots-unavailable-or-disallowed')
    def test_missing_robots_allows_but_unavailable_robots_does_not(self):
        for code,expected in [(404,True),(403,False),(500,False)]:
            with self.subTest(code=code),patch.object(collector,'fetch',side_effect=urllib.error.HTTPError('https://example.test/robots.txt',code,'failure',{},None)):
                self.assertEqual(collector.robots_allowed('https://example.test/article',{}),expected)
    def test_only_metadata_is_saved_for_public_excerpt(self):
        content='<title>面经</title><p>'+('公开内容'*200)+'剩余60%内容，订阅专栏后可继续查看</p>'
        with patch.object(collector,'fetch',side_effect=[(200,'User-agent: *\nDisallow: /blocked'),(200,content)]):
            rows=collector.collect([{'id':'s','url':'https://example.test/article'}],delay=0)
        row=rows[0]
        self.assertTrue(row['publicExcerpt'])
        self.assertEqual(row['status'],'public-content-retrieved')
        self.assertEqual(len(row['sha256']),64)
        self.assertNotIn('content',row)
        self.assertNotIn('body',row)
    def test_short_shell_is_not_valid_content(self):
        with patch.object(collector,'fetch',side_effect=[(200,''),(200,'<title>登录</title>')]):
            rows=collector.collect([{'id':'s','url':'https://example.test/article'}],delay=0)
        self.assertEqual(rows[0]['status'],'content-unavailable')
    def test_non_https_is_rejected(self):
        with patch.object(collector,'fetch') as fetch:
            rows=collector.collect([{'id':'s','url':'http://example.test/article'}],delay=0)
        fetch.assert_not_called()
        self.assertEqual(rows[0]['status'],'fetch-failed')

if __name__=='__main__':unittest.main()
