export type TaskStatus = "idle" | "selected" | "uploading" | "queued" | "processing" | "done" | "error";

export type ApiTaskStatus = "queued" | "processing" | "done" | "error" | string;

export type UploadResponse = {
	task_id?: string;
	taskId?: string;
	id?: string;
	status?: ApiTaskStatus;
	message?: string;
};

export type RecognitionStats = {
	detected_count?: number;
	detectedCount?: number;
	barcode_count?: number;
	barcodeCount?: number;
	qr_count?: number;
	qrCount?: number;
	rows_count?: number;
	rowsCount?: number;
};

export type RecognitionRow = Record<string, string | number | null | undefined>;

export type RecognitionResult = {
	task_id?: string;
	taskId?: string;
	status?: ApiTaskStatus;
	progress?: number;
	stage?: string;
	message?: string;
	error?: string;
	stats?: RecognitionStats;
	csv_url?: string;
	csvUrl?: string;
	csv?: string;
	rows?: RecognitionRow[];
	rows_preview?: RecognitionRow[];
	rowsPreview?: RecognitionRow[];
	queue_position?: number;
	queuePosition?: number;
};
