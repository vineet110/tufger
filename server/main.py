from fastapi import FastAPI

import models  # noqa: F401  (registers tables)
from db import Base, engine
from routes_admin import auth_router, router as admin_router
from routes_public import router as public_router

Base.metadata.create_all(engine)

# Site and API share one domain: everything under /api/py is FastAPI.
# Vercel routes it here in production; next.config.ts proxies it in local dev.
api = FastAPI(title="Tufger API", version="0.1.0")
api.include_router(auth_router)
api.include_router(public_router)
api.include_router(admin_router)


@api.get("/health")
def health():
    return {"ok": True, "db": engine.dialect.name}


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/api/py", api)
