import argparse
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import requests
from flask import Flask, Response, redirect, request


DEFAULT_BASE_URL = "https://app.easyinvoice.vn"
DEFAULT_HOME_PATH = "/EInvoice?Pattern=2C26MYY"
DEFAULT_PORT = 8765


def parse_args():
    parser = argparse.ArgumentParser(description="Proxy an authenticated EasyInvoice web session to localhost.")
    parser.add_argument("--cookie-file", required=True, help="Path to a Netscape/Mozilla cookie jar file.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="EasyInvoice base URL.")
    parser.add_argument("--home-path", default=DEFAULT_HOME_PATH, help="Initial path to open in the proxied UI.")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind.")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port to bind.")
    return parser.parse_args()


def load_session(cookie_file):
    session = requests.Session()
    jar = requests.cookies.RequestsCookieJar()
    for raw_line in Path(cookie_file).read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != 7:
            continue
        domain, include_subdomains, path, secure, expires, name, value = parts
        jar.set(
            name,
            value,
            domain=domain,
            path=path or "/",
            secure=str(secure).upper() == "TRUE",
            expires=int(expires) if str(expires).strip().isdigit() else None,
            rest={"HttpOnly": False},
        )
    session.cookies.update(jar)
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/135.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    })
    return session


def create_app(base_url, home_path, cookie_file):
    app = Flask(__name__)
    session = load_session(cookie_file)
    remote_origin = urlsplit(base_url.rstrip("/"))
    proxy_prefix = "/proxy"

    proxy_bootstrap = f"""
<script>
(function() {{
  const remoteOrigin = {base_url.rstrip('/')!r};
  const proxyPrefix = {proxy_prefix!r};

  function proxify(input) {{
    if (!input || typeof input !== 'string') return input;
    if (/^(javascript:|data:|mailto:|#)/i.test(input)) return input;
    let url;
    try {{
      url = new URL(input, window.location.href);
    }} catch (error) {{
      return input;
    }}
    if (url.origin !== window.location.origin && url.origin !== remoteOrigin) {{
      return input;
    }}
    if (url.pathname.startsWith(proxyPrefix + '/')) {{
      return url.pathname + url.search + url.hash;
    }}
    return proxyPrefix + url.pathname + url.search + url.hash;
  }}

  const originalFetch = window.fetch;
  if (originalFetch) {{
    window.fetch = function(input, init) {{
      if (typeof input === 'string') {{
        input = proxify(input);
      }} else if (input && input.url) {{
        input = new Request(proxify(input.url), input);
      }}
      return originalFetch.call(this, input, init);
    }};
  }}

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {{
    arguments[1] = proxify(url);
    return originalOpen.apply(this, arguments);
  }};

  document.addEventListener('submit', function(event) {{
    const form = event.target;
    if (form && form.action) {{
      form.action = proxify(form.action);
    }}
  }}, true);
}})();
</script>
"""

    def build_proxy_url(remote_url, page_url=""):
        if not remote_url:
            return remote_url
        if remote_url.startswith(("javascript:", "data:", "mailto:", "#")):
            return remote_url

        if not remote_url.startswith(("/", "http://", "https://")) and page_url:
            remote_url = urljoin(page_url, remote_url)

        parsed = urlsplit(remote_url)
        if parsed.scheme and parsed.netloc:
            if parsed.netloc != remote_origin.netloc:
                return remote_url
            path = parsed.path or "/"
            query = f"?{parsed.query}" if parsed.query else ""
            fragment = f"#{parsed.fragment}" if parsed.fragment else ""
            return f"{proxy_prefix}{path}{query}{fragment}"

        if remote_url.startswith("/"):
            return f"{proxy_prefix}{remote_url}"

        return remote_url

    def rewrite_html(html, page_url):
        def replacer(match):
            attribute = match.group(1)
            quote = match.group(2)
            url = match.group(3)
            return f"{attribute}={quote}{build_proxy_url(url, page_url)}{quote}"

        rewritten = re.sub(
            r"""(href|src|action)=([\"'])([^\"']+)\2""",
            replacer,
            html,
            flags=re.IGNORECASE,
        )

        if re.search(r"</head>", rewritten, flags=re.IGNORECASE):
            rewritten = re.sub(r"</head>", proxy_bootstrap + "</head>", rewritten, count=1, flags=re.IGNORECASE)
        else:
            rewritten = proxy_bootstrap + rewritten
        return rewritten

    def forward_request(target_url):
        headers = {}
        for header_name in ["Content-Type", "Accept", "X-Requested-With"]:
            if header_name in request.headers:
                headers[header_name] = request.headers[header_name]
        headers["Origin"] = f"{remote_origin.scheme}://{remote_origin.netloc}"
        headers["Referer"] = request.headers.get("Referer") or target_url

        response = session.request(
            method=request.method,
            url=target_url,
            params=None,
            data=request.get_data() if request.method in {"POST", "PUT", "PATCH", "DELETE"} else None,
            headers=headers,
            allow_redirects=False,
            timeout=30,
        )
        return response

    @app.get("/")
    def index():
        return redirect(f"{proxy_prefix}{home_path}")

    def serve_remote_path(target_path):
        target_path = "/" + str(target_path or "").lstrip("/")
        query = request.query_string.decode("utf-8")
        target_url = urljoin(base_url.rstrip("/") + "/", target_path.lstrip("/"))
        if query:
            target_url = f"{target_url}?{query}"

        response = forward_request(target_url)
        content_type = response.headers.get("Content-Type", "application/octet-stream")

        if response.is_redirect:
            location = response.headers.get("Location", "")
            next_url = build_proxy_url(location, target_url)
            return redirect(next_url or "/")

        if "text/html" in content_type.lower():
            html = response.text
            rewritten = rewrite_html(html, target_url)
            proxied = Response(rewritten, status=response.status_code, mimetype="text/html")
            proxied.headers["Cache-Control"] = "no-store, max-age=0"
            return proxied

        proxied = Response(response.content, status=response.status_code, mimetype=content_type.split(";", 1)[0])
        for header_name in ["Content-Disposition", "Cache-Control", "Content-Type"]:
            if header_name in response.headers:
                proxied.headers[header_name] = response.headers[header_name]
        return proxied

    @app.route(f"{proxy_prefix}", defaults={"subpath": ""}, methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    @app.route(f"{proxy_prefix}/<path:subpath>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def proxy(subpath):
        return serve_remote_path(subpath)

    @app.route("/<path:subpath>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def passthrough(subpath):
        return serve_remote_path(subpath)

    return app


def main():
    args = parse_args()
    app = create_app(args.base_url, args.home_path, args.cookie_file)
    app.run(host=args.host, port=args.port, debug=False, use_reloader=False, threaded=True)


if __name__ == "__main__":
    main()
