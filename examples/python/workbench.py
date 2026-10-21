#!/usr/bin/env python3
"""知行实验室：标准库采集 / SQLite / REST / 确定性检索。
Python >=3.11，无第三方依赖。仅请求显式指定的本机练习站点。
  python3 workbench.py demo --db runtime/python-demo.sqlite
  python3 workbench.py serve --port 8765 --db runtime/python-demo.sqlite
  python3 workbench.py crawl --base http://127.0.0.1:8765 --db runtime/python-demo.sqlite
此程序不调用大模型，检索输出不冒充模型回答。
"""
from __future__ import annotations
import argparse
from contextlib import closing
from datetime import datetime, timezone
from html import escape
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sqlite3
import threading
import time
from urllib.error import HTTPError
from urllib.parse import parse_qs, urljoin, urlsplit
from urllib.request import build_opener, HTTPRedirectHandler, Request
from urllib.robotparser import RobotFileParser

ARTICLES = [
    {'id': 'python-1', 'title': 'Python generators', 'body': 'Python generators process records lazily with bounded consumption.'},
    {'id': 'api-1', 'title': 'RESTful API', 'body': 'HTTP resources need stable contracts, validation and idempotency.'},
    {'id': 'rag-1', 'title': 'RAG evidence', 'body': 'Retrieval returns source evidence; model answers need independent evaluation.'},
]


def database(path: str):
    connection = sqlite3.connect(path, timeout=5)
    connection.row_factory = sqlite3.Row
    return connection


def initialize(path: str):
    Path(path).resolve().parent.mkdir(parents=True, exist_ok=True)
    with closing(database(path)) as connection, connection:
        connection.executescript('''
        CREATE TABLE IF NOT EXISTS articles(
          id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
          source_url TEXT NOT NULL, fetched_at TEXT NOT NULL, parser_version TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS checkpoints(
          job TEXT PRIMARY KEY, next_url TEXT, updated_at TEXT NOT NULL);
        ''')


def records(path: str):
    with closing(database(path)) as connection:
        return [dict(row) for row in connection.execute('SELECT * FROM articles ORDER BY id')]


def handler_for(path: str):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def send(self, status, value, content_type='application/json; charset=utf-8'):
            data = value.encode('utf-8') if isinstance(value, str) else json.dumps(value, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)

        def problem(self, status, title):
            self.send(status, {'type': 'about:blank', 'title': title, 'status': status}, 'application/problem+json')

        def do_GET(self):
            parsed = urlsplit(self.path)
            args = parse_qs(parsed.query)
            if parsed.path == '/robots.txt':
                return self.send(200, 'User-agent: *\nAllow: /source\nDisallow: /api/\n', 'text/plain; charset=utf-8')
            if parsed.path == '/source':
                try:
                    page = int(args.get('page', ['1'])[0])
                except ValueError:
                    return self.problem(400, 'Invalid page')
                batch = ARTICLES[:2] if page == 1 else ARTICLES[1:] if page == 2 else []
                html = ''.join(f'<article data-id="{escape(a["id"])}"><h2>{escape(a["title"])}</h2><p>{escape(a["body"])}</p></article>' for a in batch)
                if page == 1:
                    html += '<a rel="next" href="/source?page=2">Next</a>'
                return self.send(200, '<!doctype html><meta charset="utf-8">' + html, 'text/html; charset=utf-8')
            if parsed.path.startswith('/source/articles/'):
                key = parsed.path.rsplit('/', 1)[-1]
                item = next((a for a in ARTICLES if a['id'] == key), None)
                if item is None:
                    return self.problem(404, 'Not found')
                return self.send(200, '<h1>' + escape(item['title']) + '</h1><p>' + escape(item['body']) + '</p>', 'text/html; charset=utf-8')
            if parsed.path == '/api/health':
                return self.send(200, {'ok': True, 'mode': 'local-learning-demo'})
            if parsed.path == '/api/articles':
                try:
                    page, limit = int(args.get('page', ['1'])[0]), int(args.get('limit', ['2'])[0])
                    if page < 1 or not 1 <= limit <= 50:
                        raise ValueError
                except ValueError:
                    return self.problem(400, 'page >= 1 and 1 <= limit <= 50 required')
                rows = records(path)
                start = (page - 1) * limit
                return self.send(200, {'items': rows[start:start + limit], 'page': page, 'limit': limit, 'total': len(rows), 'next_page': page + 1 if start + limit < len(rows) else None})
            if parsed.path == '/api/search':
                query = args.get('q', [''])[0].strip()
                if not query or len(query) > 200:
                    return self.problem(400, 'q must contain 1..200 characters')
                terms = set(query.casefold().split())
                hits = []
                for row in records(path):
                    text = (row['title'] + ' ' + row['body']).casefold()
                    score = sum(term in text for term in terms)
                    if score:
                        hits.append({**row, 'score': score})
                hits.sort(key=lambda row: (-row['score'], row['id']))
                return self.send(200, {'mode': 'deterministic_retrieval', 'answer': None, 'hits': hits[:5], 'note': 'No model API called. Evidence is not a generated answer.'})
            return self.problem(404, 'Not found')
    return Handler


class ArticleParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.items, self.current, self.field, self.next_href = [], None, None, None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'article':
            self.current = {'id': attrs.get('data-id', ''), 'title': '', 'body': ''}
        elif self.current is not None and tag in {'h2', 'p'}:
            self.field = 'title' if tag == 'h2' else 'body'
        elif tag == 'a' and attrs.get('rel') == 'next':
            self.next_href = attrs.get('href')

    def handle_data(self, value):
        if self.current is not None and self.field is not None:
            self.current[self.field] += value

    def handle_endtag(self, tag):
        if tag in {'h2', 'p'}:
            self.field = None
        elif tag == 'article' and self.current is not None:
            item = {key: value.strip() for key, value in self.current.items()}
            if not all(item.values()):
                raise ValueError('Missing required article field')
            self.items.append(item)
            self.current, self.field = None, None


def local_origin(url: str):
    parsed = urlsplit(url)
    if parsed.scheme != 'http' or parsed.hostname not in {'127.0.0.1', 'localhost'} or parsed.username or parsed.password:
        raise ValueError('This learning demo only accepts an explicit local HTTP fixture origin')
    return parsed.scheme, parsed.hostname, parsed.port or 80


class SameOriginRedirects(HTTPRedirectHandler):
    def __init__(self, origin):
        super().__init__()
        self.origin = origin

    def redirect_request(self, request, fp, code, msg, headers, newurl):
        if local_origin(newurl) != self.origin:
            raise ValueError('Cross-origin redirect rejected')
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def fetch_text(opener, url, origin):
    if local_origin(url) != origin:
        raise ValueError('Cross-origin URL rejected')
    for attempt in range(3):
        try:
            request = Request(url, headers={'User-Agent': 'ZhixingStudyBot/1.0'})
            with opener.open(request, timeout=3) as response:
                data = response.read(262145)
                if len(data) > 262144:
                    raise ValueError('Response exceeds 256 KiB demo limit')
                if response.headers.get_content_type() not in {'text/html', 'text/plain'}:
                    raise ValueError('Unexpected media type')
                return data.decode(response.headers.get_content_charset() or 'utf-8')
        except HTTPError as error:
            retry = error.code in {429, 502, 503, 504} and attempt < 2
            retry_after = error.headers.get('Retry-After', '')
            error.close()
            if not retry:
                raise
            # 练习仅支持秒数，生产还需 HTTP-date 与端到端预算。
            wait = min(float(retry_after), 2) if retry_after.isdigit() else 0.05 * 2 ** attempt
            time.sleep(wait)
    raise RuntimeError('Retry limit reached')


def crawl(base: str, path: str, max_pages=5):
    initialize(path)
    origin = local_origin(base)
    opener = build_opener(SameOriginRedirects(origin))
    robot = RobotFileParser()
    robot.parse(fetch_text(opener, urljoin(base, '/robots.txt'), origin).splitlines())
    url, seen, pages = urljoin(base, '/source?page=1'), set(), 0
    while url:
        if url in seen:
            raise ValueError('Pagination cycle')
        if pages >= max_pages:
            raise ValueError('Page budget exceeded')
        if not robot.can_fetch('ZhixingStudyBot', url):
            raise ValueError('robots.txt denied this URL')
        seen.add(url)
        parser = ArticleParser()
        parser.feed(fetch_text(opener, url, origin))
        next_url = urljoin(url, parser.next_href) if parser.next_href else None
        if next_url and local_origin(next_url) != origin:
            raise ValueError('Next page outside scope')
        now = datetime.now(timezone.utc).isoformat()
        with closing(database(path)) as connection, connection:
            for item in parser.items:
                connection.execute('''INSERT INTO articles VALUES(?,?,?,?,?,?)
                  ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,
                  source_url=excluded.source_url,fetched_at=excluded.fetched_at,parser_version=excluded.parser_version''',
                  (item['id'], item['title'], item['body'], urljoin(base, '/source/articles/' + item['id']), now, '1'))
            connection.execute('INSERT INTO checkpoints VALUES(?,?,?) ON CONFLICT(job) DO UPDATE SET next_url=excluded.next_url,updated_at=excluded.updated_at', ('local-demo', next_url, now))
        pages += 1
        url = next_url
        time.sleep(0.02)
    return {'pages': pages, 'unique_articles': len(records(path)), 'checkpoint': 'complete'}


def run_demo(path: str):
    initialize(path)
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler_for(path))
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    base = f'http://127.0.0.1:{server.server_port}'
    try:
        first = crawl(base, path)
        second = crawl(base, path)
        assert first['unique_articles'] == second['unique_articles'] == 3
        with build_opener().open(base + '/api/articles?limit=2') as response:
            listing = json.load(response)
        with build_opener().open(base + '/api/search?q=python') as response:
            result = json.load(response)
        assert len(listing['items']) == 2 and listing['next_page'] == 2
        assert result['mode'] == 'deterministic_retrieval' and len(result['hits']) == 1 and result['answer'] is None
        return {'first_run': first, 'repeat_run': second, 'pagination_verified': True, 'retrieval_sources_verified': True, 'real_model_called': False}
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=3)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['demo', 'serve', 'crawl'])
    parser.add_argument('--db', default='runtime/python-demo.sqlite')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--base', default='http://127.0.0.1:8765')
    args = parser.parse_args()
    initialize(args.db)
    if args.command == 'demo':
        print(json.dumps(run_demo(args.db), ensure_ascii=False, indent=2))
    elif args.command == 'crawl':
        print(json.dumps(crawl(args.base, args.db), ensure_ascii=False))
    else:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), handler_for(args.db))
        print(f'Local fixture and API: http://127.0.0.1:{server.server_port}', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()

if __name__ == '__main__':
    main()
