"""
Backend 2.0 - Receipt Parser на OpenAI Responses API

Единый конвейер обработки чеков из Telegram.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import structlog

from src.config import settings
from src.database.connection import init_db, close_db
from src.api.routes import router
from src.utils.event_bus import init_event_bus, close_event_bus

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Управление жизненным циклом приложения"""
    # Startup
    logger.info("Запуск приложения", version=settings.VERSION)
    
    # Инициализация БД
    await init_db()
    logger.info("База данных инициализирована")
    
    # Инициализация Event Bus
    await init_event_bus()
    logger.info("Event Bus инициализирован")
    
    yield
    
    # Shutdown
    logger.info("Завершение работы приложения")
    await close_event_bus()
    await close_db()


app = FastAPI(
    title="Receipt Parser API",
    description="API для парсинга банковских чеков через OpenAI Responses API",
    version=settings.VERSION,
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Роуты
app.include_router(router, prefix="/api")


@app.get("/")
async def root():
    """Корневой endpoint"""
    return {
        "message": "Receipt Parser API",
        "version": settings.VERSION,
        "endpoints": {
            "receipts": "/api/receipts",
            "operators": "/api/operators",
            "health": "/api/health"
        }
    }


@app.get("/health")
@app.get("/api/health")
async def health():
    """Проверка здоровья API"""
    from src.database.connection import check_db_health
    from src.utils.event_bus import check_event_bus_health
    
    db_health = await check_db_health()
    event_bus_health = await check_event_bus_health()
    
    status = "ok" if db_health and event_bus_health else "error"
    
    return {
        "success": status == "ok",
        "status": status,
        "version": settings.VERSION,
        "services": {
            "database": "connected" if db_health else "error",
            "event_bus": "connected" if event_bus_health else "error"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )

