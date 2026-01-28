FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN groupadd -g 1000 app \
    && useradd -m -u 1000 -g 1000 -s /bin/bash app \
    && mkdir -p /app \
    && chown -R app:app /app

# deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# app (API)
COPY app ./app

USER app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host=0.0.0.0", "--port=8000"]
