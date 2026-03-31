# pyre-ignore-all-errors
from jewelry_backend.state import app, db
from jewelry_backend.setup import bootstrap_database

# Register models before bootstrap/create_all.
from jewelry_backend import models as _models  # noqa: F401

# Register route groups for side effects.
from jewelry_backend import cashier_routes as _cashier_routes  # noqa: F401
from jewelry_backend import catalog_routes as _catalog_routes  # noqa: F401
from jewelry_backend import config_routes as _config_routes  # noqa: F401
from jewelry_backend import items_routes as _items_routes  # noqa: F401
from jewelry_backend import loans_routes as _loans_routes  # noqa: F401
from jewelry_backend import nhap_vang_routes as _nhap_vang_routes  # noqa: F401
from jewelry_backend import ocr_routes as _ocr_routes  # noqa: F401
from jewelry_backend import orders_routes as _orders_routes  # noqa: F401
from jewelry_backend import easyinvoice_web_routes as _easyinvoice_web_routes  # noqa: F401
from jewelry_backend import print_routes as _print_routes  # noqa: F401
from jewelry_backend import scale_routes as _scale_routes  # noqa: F401
from jewelry_backend import upload_routes as _upload_routes  # noqa: F401


bootstrap_database()


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
