export function formatFileSize(bytes: number): string {
	if (!bytes) return "0 Б";

	const units = ["Б", "КБ", "МБ", "ГБ"];
	const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const value = bytes / 1024 ** index;

	return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function clampProgress(value?: number): number | undefined {
	if (typeof value !== "number" || Number.isNaN(value)) return undefined;
	return Math.max(0, Math.min(100, Math.round(value)));
}

export function toDisplayValue(value: string | number | null | undefined): string {
	if (value === null || value === undefined || value === "") return "—";
	return String(value);
}
