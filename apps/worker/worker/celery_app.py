from celery import Celery
import os

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "fluidmanager_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.beat_schedule = {
    "scheduler-tick-every-3s": {
        "task": "fm.scheduler_tick",
        "schedule": 3.0,
        "args": (25,),
    }
}

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Paris",
    enable_utc=True,
    task_track_started=True,
    broker_connection_retry_on_startup=True,
)

# IMPORTANT: register tasks
import worker.tasks  # noqa: F401
