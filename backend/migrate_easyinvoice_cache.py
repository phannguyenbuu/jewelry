import json

import app_jewelry  # noqa: F401
from jewelry_backend.easyinvoice_cache import bootstrap_easyinvoice_cache, sync_easyinvoice_cache_once


def main():
    bootstrap_easyinvoice_cache()
    result = sync_easyinvoice_cache_once('migration')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
