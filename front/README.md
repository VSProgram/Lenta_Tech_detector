# ПолкаВоды — frontend

Демо-интерфейс для Lenta Tech Life Hack: загрузка видео с робота, запуск распознавания ценников, предпросмотр результата и скачивание CSV.

## Стек

- React 18
- TypeScript
- Vite 5.4.14
- CSS без UI-фреймворка

Vite зафиксирован на версии 5.4.14, Node.js 20.12.2.

## Запуск

```bash
npm install
npm run dev
```

По умолчанию включен демо-режим:

```env
VITE_MOCK_API=true
```

В этом режиме можно выбрать любой видеофайл и посмотреть весь сценарий без backend.

## Подключение к backend

В `.env` выключить mock:

```env
VITE_API_URL=http://localhost:8000
VITE_UPLOAD_FIELD=file
VITE_POLL_INTERVAL_MS=2500
VITE_MOCK_API=false
```

Для деплоя через Nginx лучше использовать:

```env
VITE_API_URL=/api
VITE_MOCK_API=false
```

## Ожидаемый API

```txt
GET  /health
POST /upload
GET  /result/{task_id}
GET  /result/{task_id}/csv
```

Если фронт идет через `/api`, то Nginx должен проксировать:

```txt
/api/health             -> backend /health
/api/upload             -> backend /upload
/api/result/{task_id}   -> backend /result/{task_id}
/api/result/{task_id}/csv -> backend /result/{task_id}/csv
```

## POST /upload

Request:

```txt
multipart/form-data
file: video.mp4
```

Response:

```json
{
  "task_id": "task_123",
  "status": "queued"
}
```

Поле файла настраивается через `VITE_UPLOAD_FIELD`. По умолчанию используется `file`.

## GET /result/{task_id}

Пока задача в очереди:

```json
{
  "task_id": "task_123",
  "status": "queued",
  "queue_position": 1,
  "stage": "Задача ожидает обработки",
  "progress": 10
}
```

Пока идет обработка:

```json
{
  "task_id": "task_123",
  "status": "processing",
  "stage": "Распознавание ценников",
  "progress": 65
}
```

Когда готово:

```json
{
  "task_id": "task_123",
  "status": "done",
  "progress": 100,
  "stats": {
    "detected_count": 128,
    "barcode_count": 94,
    "qr_count": 61,
    "rows_count": 128
  },
  "csv_url": "/result/task_123/csv",
  "rows_preview": [
    {
      "filename": "robot_shelf_001.mp4",
      "product_name": "Вода питьевая 1,5 л",
      "price_default": "69.99",
      "price_card": "54.99",
      "barcode": "4601234567890",
      "id_sku": "102938",
      "frame_timestamp": 7000,
      "x_min": 124,
      "y_min": 318,
      "x_max": 268,
      "y_max": 394
    }
  ]
}
```

При ошибке:

```json
{
  "task_id": "task_123",
  "status": "error",
  "error": "Не удалось распознать видео"
}
```

## CSV

Кнопка скачивания работает в таком порядке:

1. если backend вернул `csv` текстом, фронт скачает его;
2. если backend вернул `csv_url`, фронт скачает файл по этой ссылке;
3. если `csv_url` нет, фронт попробует скачать `/result/{task_id}/csv`;
4. в mock-режиме CSV собирается из preview-строк.

## Сборка

```bash
npm run build
```

Готовые файлы будут в `dist/`.

## Docker

```bash
docker build -t polkavody-front .
docker run -p 8080:80 polkavody-front
```

Открыть:

```txt
http://localhost:8080
```
