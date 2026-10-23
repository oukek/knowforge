#!/usr/bin/env python3
"""Check curated public references; save retrieval metadata, never scrape login/paywalls.
Output is a local audit report. Editorial review is still needed before changing the catalog.
"""
import argparse
import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AGENT = 'KnowForge-PublicReferenceCollector/1.0'

class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hidden = 0
        self.in_title = False
        self.parts = []
        self.title = []
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript'):
            self.hidden += 1
        if tag == 'title':
            self.in_title = True
    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript'):
            self.hidden = max(0, self.hidden - 1)
        if tag == 'title':
            self.in_title = False
    def handle_data(self, data):
        if self.in_title:
            self.title.append(data)
        if not self.hidden and data.strip():
            self.parts.append(data.strip())

def fetch(url, max_bytes=2 * 1024 * 1024):
    req = urllib.request.Request(url, headers={'User-Agent': AGENT})
    with urllib.request.urlopen(req, timeout=12) as response:
        if urllib.parse.urlsplit(response.url).scheme != 'https':
            raise ValueError('unexpected non-HTTPS redirect')
        raw = response.read(max_bytes + 1)
        if len(raw) > max_bytes:
            raise ValueError('response size limit exceeded')
        return response.status, raw.decode('utf-8', errors='replace')

def robots_allowed(url, cache):
    parsed = urllib.parse.urlsplit(url)
    origin = f'{parsed.scheme}://{parsed.netloc}'
    if origin not in cache:
        try:
            _, body = fetch(origin + '/robots.txt', 256 * 1024)
            parser = urllib.robotparser.RobotFileParser()
            parser.parse(body.splitlines())
            cache[origin] = parser
        except urllib.error.HTTPError as error:
            cache[origin] = True if error.code == 404 else False
        except Exception:
            cache[origin] = False
    policy = cache[origin]
    return policy if isinstance(policy, bool) else policy.can_fetch(AGENT, url)

def collect(sources, delay=1):
    cache, results = {}, []
    for source in sources:
        row = {'id': source['id'], 'url': source['url'], 'checkedAt': datetime.now(timezone.utc).isoformat()}
        try:
            if urllib.parse.urlsplit(source['url']).scheme != 'https':
                raise ValueError('only curated HTTPS references are supported')
            if not robots_allowed(source['url'], cache):
                row['status'] = 'robots-unavailable-or-disallowed'
            else:
                status, body = fetch(source['url'])
                parser = VisibleText()
                parser.feed(body)
                text = '\n'.join(parser.parts)
                row.update(httpStatus=status, title=''.join(parser.title).strip(),
                    visibleCharacters=len(text), sha256=hashlib.sha256(text.encode()).hexdigest(),
                    publicExcerpt=bool(re.search(r'剩余\s*\d+%|订阅专栏后可', text)),
                    status='public-content-retrieved' if len(text) >= 500 else 'content-unavailable')
        except Exception as error:
            row.update(status='fetch-failed', error=str(error)[:240])
        results.append(row)
        print(f"{row['id']}: {row['status']}", flush=True)
        time.sleep(delay)
    return results

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default=str(ROOT / 'output/interview-research/retrieval.json'))
    args = parser.parse_args()
    sources = json.loads((ROOT / 'data/content/interviews/sources.json').read_text())
    report = {'note': 'Retrieval confirms visible public content only, not employer authenticity or interview frequency.', 'sources': collect(sources)}
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f'Saved metadata: {target}')

if __name__ == '__main__':
    main()
