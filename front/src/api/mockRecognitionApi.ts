import type {RecognitionResult} from "../types/recognition";

let mockProgress = 0;
let mockTaskId = "demo-task-001";

const previewRows = [
	{
		filename: "robot_shelf_001.mp4",
		product_name: "Вода питьевая 1,5 л",
		price_default: "69.99",
		price_card: "54.99",
		barcode: "4601234567890",
		id_sku: "102938",
		frame_timestamp: 7000,
		x_min: 124,
		y_min: 318,
		x_max: 268,
		y_max: 394,
	},
	{
		filename: "robot_shelf_001.mp4",
		product_name: "Минеральная вода 0,5 л",
		price_default: "48.90",
		price_card: "39.90",
		barcode: "4600987654321",
		id_sku: "203847",
		frame_timestamp: 9000,
		x_min: 386,
		y_min: 332,
		x_max: 524,
		y_max: 407,
	},
	{
		filename: "robot_shelf_001.mp4",
		product_name: "Сок яблочный 1 л",
		price_default: "119.99",
		price_card: "99.99",
		barcode: "4600001112223",
		id_sku: "309522",
		frame_timestamp: 13000,
		x_min: 710,
		y_min: 341,
		x_max: 864,
		y_max: 421,
	},
];

export async function mockCheckHealth(): Promise<boolean> {
	await wait(250);
	return true;
}

export async function mockUploadVideo(): Promise<string> {
	mockProgress = 0;
	mockTaskId = `demo-task-${Date.now()}`;
	await wait(900);
	return mockTaskId;
}

export async function mockGetResult(taskId: string): Promise<RecognitionResult> {
	await wait(650);
	mockProgress += Math.floor(18 + Math.random() * 18);

	if (mockProgress < 30) {
		return {
			task_id: taskId,
			status: "queued",
			queue_position: 1,
			stage: "Задача ожидает обработки",
			progress: mockProgress,
		};
	}

	if (mockProgress < 100) {
		return {
			task_id: taskId,
			status: "processing",
			stage: mockProgress < 70 ? "Поиск ценников на кадрах" : "Распознавание текста и QR-кодов",
			progress: mockProgress,
		};
	}

	return {
		task_id: taskId,
		status: "done",
		stage: "CSV-файл готов",
		progress: 100,
		stats: {
			detected_count: 128,
			barcode_count: 94,
			qr_count: 61,
			rows_count: 128,
		},
		rows_preview: previewRows,
		csv: makeCsv(),
	};
}

function makeCsv(): string {
	const header = "filename,product_name,price_default,price_card,barcode,id_sku,frame_timestamp,x_min,y_min,x_max,y_max";
	const rows = previewRows.map((row) =>
		[
			row.filename,
			row.product_name,
			row.price_default,
			row.price_card,
			row.barcode,
			row.id_sku,
			row.frame_timestamp,
			row.x_min,
			row.y_min,
			row.x_max,
			row.y_max,
		]
			.map((value) => `"${String(value).replace(/"/g, '""')}"`)
			.join(",")
	);

	return [header, ...rows].join("\n");
}

function wait(ms: number) {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}
