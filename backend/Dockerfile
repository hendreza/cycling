FROM python:3.13-slim
WORKDIR /app
COPY requirements.lock.txt .
RUN pip install --no-cache-dir -r requirements.lock.txt && useradd --create-home pilot && mkdir /data && chown pilot /data
COPY app ./app
COPY scripts ./scripts
USER pilot
ENV DATABASE_PATH=/data/pilot.db
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
