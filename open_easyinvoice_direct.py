import argparse
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.common.by import By
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.edge.service import Service as EdgeService
from webdriver_manager.chrome import ChromeDriverManager
from webdriver_manager.microsoft import EdgeChromiumDriverManager


DEFAULT_URL = "https://app.easyinvoice.vn/EInvoice/Edit/26122541?Pattern=2C26MYY"


def parse_args():
    parser = argparse.ArgumentParser(description="Open EasyInvoice in a real browser using an existing cookie jar.")
    parser.add_argument("--cookie-file", required=True, help="Path to the Netscape cookie file.")
    parser.add_argument("--url", default=DEFAULT_URL, help="EasyInvoice URL to open.")
    parser.add_argument("--browser", choices=["chrome", "edge"], default="chrome", help="Browser to launch.")
    return parser.parse_args()


def load_netscape_cookies(cookie_file):
    cookies = []
    for raw_line in Path(cookie_file).read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != 7:
            continue
        domain, include_subdomains, path, secure, expires, name, value = parts
        cookie = {
            "domain": domain,
            "path": path or "/",
            "secure": str(secure).upper() == "TRUE",
            "name": name,
            "value": value,
        }
        if str(expires).strip().isdigit():
            cookie["expiry"] = int(expires)
        cookies.append(cookie)
    return cookies


def build_chrome_driver():
    options = ChromeOptions()
    options.binary_location = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    options.add_experimental_option("detach", True)
    options.add_argument("--start-maximized")
    options.add_argument("--disable-blink-features=AutomationControlled")
    service = ChromeService(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=options)


def build_edge_driver():
    options = EdgeOptions()
    options.binary_location = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    options.add_experimental_option("detach", True)
    options.add_argument("--start-maximized")
    service = EdgeService(EdgeChromiumDriverManager().install())
    return webdriver.Edge(service=service, options=options)


def build_driver(browser):
    if browser == "edge":
        return build_edge_driver()
    return build_chrome_driver()


def main():
    args = parse_args()
    cookies = load_netscape_cookies(args.cookie_file)
    if not cookies:
        raise RuntimeError("Cookie file is empty or invalid.")

    driver = build_driver(args.browser)
    driver.get("https://app.easyinvoice.vn/")
    time.sleep(2)

    for cookie in cookies:
        try:
            driver.add_cookie(cookie)
        except Exception:
            fallback = {
                key: value
                for key, value in cookie.items()
                if key in {"name", "value", "domain", "path", "secure", "expiry"}
            }
            driver.add_cookie(fallback)

    driver.get(args.url)
    time.sleep(5)

    try:
        driver.find_element(By.TAG_NAME, "body")
    except Exception:
        pass

    print(args.url)


if __name__ == "__main__":
    main()
