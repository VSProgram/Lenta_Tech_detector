import os
import tempfile
import csv
import cv2
import re

# Глобальные переменные для ленивой инициализации
_yolo_model = None
_easyocr_reader = None

def _get_yolo():
    global _yolo_model
    if _yolo_model is None:
        from ultralytics import YOLO
        _yolo_model = YOLO("best.pt", verbose=False)
    return _yolo_model

def _get_reader():
    global _easyocr_reader
    if _easyocr_reader is None:
        import easyocr
        _easyocr_reader = easyocr.Reader(['ru', 'en'], gpu=False)
    return _easyocr_reader

def _extract_price_from_crop(crop_img):
    reader = _get_reader()
    rgb = cv2.cvtColor(crop_img, cv2.COLOR_BGR2RGB)
    result = reader.readtext(rgb, allowlist='0123456789.,', detail=0, paragraph=False)
    text = ' '.join(result)
    match = re.search(r'(\d+[.,]\d{2})', text)
    if match:
        return match.group(1).replace(',', '.')
    match = re.search(r'\b(\d{1,4})\b', text)
    if match:
        return match.group(1)
    return ''

def process_video(video_path: str) -> str:
    yolo = _get_yolo()
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_interval = max(1, int(fps))
    frame_num = 0
    all_detections = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        if frame_num % frame_interval == 0:
            timestamp_ms = int(frame_num / fps * 1000)
            frame = cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)
            results = yolo(frame, conf=0.05, verbose=False)
            for box in results[0].boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
                if (x2 - x1) * (y2 - y1) < 2000:
                    continue
                crop = frame[y1:y2, x1:x2]
                if crop.size == 0:
                    continue
                price = _extract_price_from_crop(crop)

                row = {
                    'filename': os.path.basename(video_path),
                    'product_name': '',
                    'price_default': price,
                    'price_card': '',
                    'price_discount': '',
                    'barcode': '',
                    'discount_amount': '',
                    'id_sku': '',
                    'print_datetime': '',
                    'code': '',
                    'additional_info': '',
                    'color': '',
                    'special_symbols': '',
                    'frame_timestamp': timestamp_ms,
                    'x_min': x1,
                    'y_min': y1,
                    'x_max': x2,
                    'y_max': y2,
                    'qr_code_barcode': '',
                    'price1_qr': '',
                    'price2_qr': '',
                    'price3_qr': '',
                    'price4_qr': '',
                    'wholesale_level_1_count': '',
                    'wholesale_level_1_price': '',
                    'wholesale_level_2_count': '',
                    'wholesale_level_2_price': '',
                    'action_price_qr': '',
                    'action_code_qr': ''
                }
                all_detections.append(row)
        frame_num += 1
        if frame_num % 100 == 0:
            print(f"Обработано кадров: {frame_num}")

    cap.release()

    columns = [
        'filename', 'product_name', 'price_default', 'price_card', 'price_discount',
        'barcode', 'discount_amount', 'id_sku', 'print_datetime', 'code',
        'additional_info', 'color', 'special_symbols', 'frame_timestamp',
        'x_min', 'y_min', 'x_max', 'y_max', 'qr_code_barcode', 'price1_qr',
        'price2_qr', 'price3_qr', 'price4_qr', 'wholesale_level_1_count',
        'wholesale_level_1_price', 'wholesale_level_2_count', 'wholesale_level_2_price',
        'action_price_qr', 'action_code_qr'
    ]
    temp_csv = tempfile.NamedTemporaryFile(delete=False, suffix='.csv', mode='w', newline='', encoding='utf-8-sig')
    writer = csv.DictWriter(temp_csv, fieldnames=columns)
    writer.writeheader()
    writer.writerows(all_detections)
    temp_csv.close()
    return temp_csv.name