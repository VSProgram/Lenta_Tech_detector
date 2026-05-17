import {mockCheckHealth, mockGetResult, mockUploadVideo} from "./mockRecognitionApi";
import type {RecognitionResult, UploadResponse} from "../types/recognition";
import {downloadBlob, downloadTextFile, rowsToCsv} from "../utils/csv";

const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
const UPLOAD_FIELD = import.meta.env.VITE_UPLOAD_FIELD || "file";
const MOCK_API = import.meta.env.VITE_MOCK_API === "true";

export function isMockApiEnabled() {
	return MOCK_API;
}

export async function checkHealth(): Promise<boolean> {
	if (MOCK_API) return mockCheckHealth();

	try {
		const response = await fetch(`${API_URL}/health`);
		return response.ok;
	} catch {
		return false;
	}
}

export async function uploadVideo(file: File): Promise<string> {
	if (MOCK_API) return mockUploadVideo();

	const formData = new FormData();
	formData.append(UPLOAD_FIELD, file);

	const response = await fetch(`${API_URL}/upload`, {
		method: "POST",
		body: formData,
	});

	if (!response.ok) {
		throw new Error(await readError(response, "Не удалось загрузить видео"));
	}

	const data: UploadResponse = await response.json();
	const taskId = data.task_id || data.taskId || data.id;

	if (!taskId) {
		throw new Error("Сервер не вернул task_id");
	}

	return taskId;
}

export async function getResult(taskId: string): Promise<RecognitionResult> {
	if (MOCK_API) return mockGetResult(taskId);

	const response = await fetch(`${API_URL}/result/${encodeURIComponent(taskId)}`);

	if (!response.ok) {
		throw new Error(await readError(response, "Не удалось получить результат обработки"));
	}

	return response.json();
}

export async function downloadRecognitionCsv(taskId: string, result?: RecognitionResult) {
	const filename = `polkavody_result_${taskId}.csv`;

	if (result?.csv) {
		downloadTextFile(result.csv, filename);
		return;
	}

	const previewRows = result?.rows_preview || result?.rowsPreview || result?.rows;
	const csvUrl = result?.csv_url || result?.csvUrl;

	if (MOCK_API && previewRows?.length) {
		downloadTextFile(rowsToCsv(previewRows), filename);
		return;
	}

	const url = csvUrl ? toAbsoluteUrl(csvUrl) : `${API_URL}/result/${encodeURIComponent(taskId)}/csv`;
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error("Не удалось скачать CSV");
	}

	const blob = await response.blob();
	downloadBlob(blob, filename);
}

function toAbsoluteUrl(url: string) {
	if (/^https?:\/\//i.test(url)) return url;
	return `${API_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

async function readError(response: Response, fallback: string) {
	try {
		const data = await response.json();
		return data?.detail || data?.error || data?.message || fallback;
	} catch {
		return fallback;
	}
}
