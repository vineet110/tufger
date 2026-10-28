from fastapi import FastAPI

import models  # noqa: F401  (registers tables)
from db import Base, engine, migrate
from routes_accounts import admin_router as site_admin_router, bootstrap, public_router as rules_router, router as accounts_router
from routes_admin import router as host_router
from routes_khata import public_router as bill_router, router as khata_router
from routes_public import router as public_router
from routes_teamsheet import router as teamsheet_router

Base.metadata.create_all(engine)
migrate()
bootstrap()

# Site and API share one domain: everything under /api/py is FastAPI.
# Vercel routes it here in production; next.config.ts proxies it in local dev.
api = FastAPI(title="Tufger API", version="0.2.0")
api.include_router(accounts_router)
api.include_router(site_admin_router)
api.include_router(public_router)
api.include_router(rules_router)
api.include_router(bill_router)
api.include_router(host_router)
api.include_router(teamsheet_router)
api.include_router(khata_router)


@api.get("/health")
def health():
    return {"ok": True, "db": engine.dialect.name}


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/api/py", api)
