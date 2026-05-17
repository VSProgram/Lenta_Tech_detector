import type {RecognitionRow} from "../types/recognition";

const DEFAULT_COLUMNS = [
	"filename",
	"product_name",
	"price_default",
	"price_card",
	"barcode",
	"id_sku",
	"frame_timestamp",
	"x_min",
	"y_min",
	"x_max",
	"y_max",
];

export function rowsToCsv(rows: RecognitionRow[]): string {
	const columns = Array.from(new Set([...DEFAULT_COLUMNS, ...rows.flatMap((row) => Object.keys(row))]));
	const header = columns.join(",");
	const body = rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(","));

	return [header, ...body].join("\n");
}

export function downloadTextFile(content: string, filename: string, type = "text/csv;charset=utf-8") {
	const blob = new Blob([content], {type});
	downloadBlob(blob, filename);
}

export function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");

	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();

	URL.revokeObjectURL(url);
}

function escapeCsv(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "";

	const text = String(value);
	const shouldQuote = text.includes(",") || text.includes('"') || text.includes("\n");
	const escaped = text.replace(/"/g, '""');

	return shouldQuote ? `"${escaped}"` : escaped;
}
