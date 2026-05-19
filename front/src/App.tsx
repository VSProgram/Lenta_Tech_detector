import {useEffect, useMemo, useRef, useState} from "react";
import type {ChangeEvent, DragEvent} from "react";
import {checkHealth, downloadRecognitionCsv, getResult, isMockApiEnabled, uploadVideo} from "./api/recognitionApi";
import type {RecognitionResult, RecognitionRow, TaskStatus} from "./types/recognition";
import {clampProgress, formatFileSize} from "./utils/format";

const POLL_INTERVAL = Number(import.meta.env.VITE_POLL_INTERVAL_MS || 2500);
const ACCEPTED_FORMATS = ".mp4,.mov,.avi,.mkv,video/mp4,video/quicktime,video/x-msvideo";

type Page = "work" | "history" | "team" | "brief";

type HistoryItem = {
	id: string;
	fileName: string;
	startedAt: string;
	status: TaskStatus;
	duration?: string;
	rows?: number | string;
	barcode?: number | string;
	qr?: number | string;
};

const historySeed: HistoryItem[] = [
	{
		id: "demo-001",
		fileName: "robot_shelf_001.mp4",
		startedAt: "18.05, 00:14",
		status: "done",
		duration: "2 мин 18 сек",
		rows: 128,
		barcode: 94,
		qr: 61,
	},
	{
		id: "demo-002",
		fileName: "milk_rack_test.mov",
		startedAt: "18.05, 00:06",
		status: "done",
		duration: "1 мин 42 сек",
		rows: 74,
		barcode: 55,
		qr: 28,
	},
];

const previewColumns = ["product_name", "price_default", "price_card", "barcode", "id_sku", "frame_timestamp", "bbox"];

const team = [
	{name: "Николай Савченко", role: "Frontend / DevOps", zone: "интерфейс, деплой, подключение API"},
	{name: "Валерий Т", role: "Team Lead", zone: "координация, стратегия, финальная сборка"},
	{name: "Саня", role: "CV / Recognition", zone: "детекция ценников, OCR, QR/barcode"},
	{name: "Даниар", role: "Backend", zone: "API, очередь задач, выдача результата"},
];

export default function App() {
	const [page, setPage] = useState<Page>("work");
	const [apiOnline, setApiOnline] = useState<boolean | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [taskId, setTaskId] = useState<string | null>(null);
	const [status, setStatus] = useState<TaskStatus>("idle");
	const [result, setResult] = useState<RecognitionResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [downloadError, setDownloadError] = useState<string | null>(null);
	const [history, setHistory] = useState<HistoryItem[]>(historySeed);
	const [elapsedMs, setElapsedMs] = useState(0);
	const pollTimerRef = useRef<number | null>(null);
	const startedAtRef = useRef<number | null>(null);
	const isMockMode = isMockApiEnabled();

	useEffect(() => {
		let mounted = true;

		checkHealth().then((online) => {
			if (mounted) setApiOnline(online);
		});

		return () => {
			mounted = false;
			clearPollTimer();
		};
	}, []);

	useEffect(() => {
		if (!file) {
			setPreviewUrl(null);
			return;
		}

		const url = URL.createObjectURL(file);
		setPreviewUrl(url);

		return () => URL.revokeObjectURL(url);
	}, [file]);

	useEffect(() => {
		const busy = status === "uploading" || status === "queued" || status === "processing";
		if (!busy) return;

		const timer = window.setInterval(() => {
			setElapsedMs(Date.now() - (startedAtRef.current || Date.now()));
		}, 1000);

		return () => window.clearInterval(timer);
	}, [status]);

	const rows = useMemo(() => getRows(result), [result]);

	const handleFileSelect = (selectedFile: File) => {
		clearPollTimer();
		setFile(selectedFile);
		setTaskId(null);
		setStatus("selected");
		setResult(null);
		setError(null);
		setDownloadError(null);
		setElapsedMs(0);
	};

	const handleStart = async () => {
		if (!file) return;

		clearPollTimer();
		setStatus("uploading");
		setError(null);
		setDownloadError(null);
		setResult(null);
		startedAtRef.current = Date.now();
		setElapsedMs(0);

		try {
			const nextTaskId = await uploadVideo(file);
			setTaskId(nextTaskId);
			setStatus("queued");
			upsertHistory({
				id: nextTaskId,
				fileName: file.name,
				startedAt: formatDate(new Date()),
				status: "queued",
			});
			await pollResult(nextTaskId, file.name);
		} catch (uploadError) {
			setStatus("error");
			setError(getErrorMessage(uploadError));
		}
	};

	const pollResult = async (nextTaskId: string, fileName: string) => {
		try {
			const nextResult = await getResult(nextTaskId);
			const nextStatus = normalizeStatus(nextResult.status);

			setResult(nextResult);
			setStatus(nextStatus);

			if (nextStatus === "done") {
				const stats = nextResult.stats || {};
				const nextRows = getRows(nextResult);
				upsertHistory({
					id: nextTaskId,
					fileName,
					startedAt: formatDate(new Date(startedAtRef.current || Date.now())),
					status: "done",
					duration: formatDuration(Date.now() - (startedAtRef.current || Date.now())),
					rows: stats.rows_count ?? stats.rowsCount ?? nextRows.length,
					barcode: stats.barcode_count ?? stats.barcodeCount ?? "—",
					qr: stats.qr_count ?? stats.qrCount ?? "—",
				});
				return;
			}

			if (nextStatus === "error") {
				setError(nextResult.error || nextResult.message || "Ошибка обработки видео");
				upsertHistory({
					id: nextTaskId,
					fileName,
					startedAt: formatDate(new Date(startedAtRef.current || Date.now())),
					status: "error",
				});
				return;
			}

			upsertHistory({
				id: nextTaskId,
				fileName,
				startedAt: formatDate(new Date(startedAtRef.current || Date.now())),
				status: nextStatus,
			});

			pollTimerRef.current = window.setTimeout(() => {
				void pollResult(nextTaskId, fileName);
			}, POLL_INTERVAL);
		} catch (pollError) {
			setStatus("error");
			setError(getErrorMessage(pollError));
		}
	};

	const handleDownload = async () => {
		if (!taskId) return;

		setDownloadError(null);

		try {
			await downloadRecognitionCsv(taskId, result || undefined);
		} catch (csvError) {
			setDownloadError(getErrorMessage(csvError));
		}
	};

	const handleReset = () => {
		clearPollTimer();
		setFile(null);
		setTaskId(null);
		setStatus("idle");
		setResult(null);
		setError(null);
		setDownloadError(null);
		setElapsedMs(0);
		startedAtRef.current = null;
	};

	const clearPollTimer = () => {
		if (pollTimerRef.current) {
			window.clearTimeout(pollTimerRef.current);
			pollTimerRef.current = null;
		}
	};

	const upsertHistory = (item: HistoryItem) => {
		setHistory((current) => {
			const withoutCurrent = current.filter((historyItem) => historyItem.id !== item.id);
			return [item, ...withoutCurrent].slice(0, 12);
		});
	};

	return (
		<div className="app-shell">
			<Header page={page} setPage={setPage} />
			<main className="main-layout">
				{page === "work" && (
					<WorkPage
						file={file}
						previewUrl={previewUrl}
						status={status}
						result={result}
						rows={rows}
						error={error}
						downloadError={downloadError}
						taskId={taskId}
						history={history}
						elapsedMs={elapsedMs}
						onFileSelect={handleFileSelect}
						onStart={handleStart}
						onReset={handleReset}
						onDownload={handleDownload}
						setPage={setPage}
					/>
				)}

				{page === "history" && <HistoryPage history={history} setPage={setPage} />}
				{page === "team" && <TeamPage />}
				{page === "brief" && <BriefPage />}
			</main>
			<Footer />
		</div>
	);
}

function Header({page, setPage}: {page: Page; setPage: (page: Page) => void}) {
	return (
		<header className="topbar">
			<div className="topbar-inner">
				<button className="brand" onClick={() => setPage("work")} type="button">
					<span className="brand-name">
						Полка<span>Воды</span>
					</span>
					<small>распознавание ценников по видео</small>
				</button>

				<nav className="main-nav" aria-label="Навигация">
					<button className={page === "work" ? "active" : ""} type="button" onClick={() => setPage("work")}>
						Обработка
					</button>
					<button className={page === "history" ? "active" : ""} type="button" onClick={() => setPage("history")}>
						История
					</button>
					<button className={page === "team" ? "active" : ""} type="button" onClick={() => setPage("team")}>
						Команда
					</button>
					<button className={page === "brief" ? "active" : ""} type="button" onClick={() => setPage("brief")}>
						О решении
					</button>
				</nav>
			</div>
		</header>
	);
}

function WorkPage(props: {
	file: File | null;
	previewUrl: string | null;
	status: TaskStatus;
	result: RecognitionResult | null;
	rows: RecognitionRow[];
	error: string | null;
	downloadError: string | null;
	taskId: string | null;
	history: HistoryItem[];
	elapsedMs: number;
	onFileSelect: (file: File) => void;
	onStart: () => void;
	onReset: () => void;
	onDownload: () => void;
	setPage: (page: Page) => void;
}) {
	const isBusy = props.status === "uploading" || props.status === "queued" || props.status === "processing";

	return (
		<>
			<section className="work-grid">
				<Panel className="upload-card" title="Видео" number="1">
					<VideoInput file={props.file} isBusy={isBusy} onFileSelect={props.onFileSelect} />
					<FileControls file={props.file} status={props.status} onStart={props.onStart} onReset={props.onReset} />
				</Panel>

				<Panel className="preview-card" title="Превью" number="2">
					{props.previewUrl ? (
						<video className="video-preview" src={props.previewUrl} controls muted />
					) : (
						<div className="video-placeholder">
							<strong>Нет выбранного файла</strong>
							<span>После выбора видео здесь появится превью.</span>
						</div>
					)}
				</Panel>

				<Panel className="status-card" title="Состояние" number="3">
					<StatusBox status={props.status} result={props.result} error={props.error} elapsedMs={props.elapsedMs} />
				</Panel>

				<Panel className="result-card" title="Результат CSV" number="4">
					<ResultBox
						taskId={props.taskId}
						status={props.status}
						result={props.result}
						rows={props.rows}
						downloadError={props.downloadError}
						onDownload={props.onDownload}
					/>
				</Panel>

				<Panel className="history-card" title="Последние запуски" number="5">
					<MiniHistory history={props.history} onOpen={() => props.setPage("history")} />
				</Panel>
			</section>
		</>
	);
}

function VideoInput({file, isBusy, onFileSelect}: {file: File | null; isBusy: boolean; onFileSelect: (file: File) => void}) {
	const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
		const selectedFile = event.target.files?.[0];
		if (selectedFile) onFileSelect(selectedFile);
	};

	const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
		event.preventDefault();
		const selectedFile = event.dataTransfer.files?.[0];
		if (selectedFile) onFileSelect(selectedFile);
	};

	return (
		<label
			className={`dropbox ${file ? "dropbox--selected" : ""}`}
			onDragOver={(event) => event.preventDefault()}
			onDrop={handleDrop}
		>
			<input type="file" accept={ACCEPTED_FORMATS} onChange={handleInputChange} disabled={isBusy} />
			<span className="file-mark">MP4</span>
			<strong>{file ? file.name : "Выберите или перетащите видео"}</strong>
			<small>{file ? formatFileSize(file.size) : "MP4, MOV, AVI, MKV"}</small>
		</label>
	);
}

function FileControls({
	file,
	status,
	onStart,
	onReset,
}: {
	file: File | null;
	status: TaskStatus;
	onStart: () => void;
	onReset: () => void;
}) {
	const isBusy = status === "uploading" || status === "queued" || status === "processing";
	const canStart = Boolean(file) && !isBusy;

	return (
		<div className="actions-row">
			<button className="primary-btn" type="button" onClick={onStart} disabled={!canStart}>
				{isBusy ? "В работе" : "Запустить"}
			</button>
			<button className="secondary-btn" type="button" onClick={onReset} disabled={isBusy || !file}>
				Сбросить
			</button>
		</div>
	);
}

function StatusBox({
	status,
	result,
	error,
	elapsedMs,
}: {
	status: TaskStatus;
	result: RecognitionResult | null;
	error: string | null;
	elapsedMs: number;
}) {
	const hasProgress = typeof result?.progress === "number" || status === "done";
	const progress = status === "done" ? 100 : clampProgress(result?.progress);
	const busy = status === "uploading" || status === "queued" || status === "processing";
	const stage = error || result?.stage || getStatusText(status);

	return (
		<div className="status-box">
			<div className="status-topline">
				<div>
					<strong>{getStatusTitle(status)}</strong>
					<span>{stage}</span>
				</div>
				{busy && <div className="loader" aria-label="Идет обработка" />}
			</div>

			<div className="processing-meta">
				<span>Время: {formatDuration(elapsedMs)}</span>
				<span>Опрос: {Math.round(POLL_INTERVAL / 1000)} сек</span>
			</div>

			<div className={hasProgress ? "progress-track" : "progress-track progress-track--indeterminate"}>
				<span style={hasProgress ? {width: `${progress}%`} : undefined} />
			</div>

			<div className="stage-list">
				{getStages(status).map((item) => (
					<div className={`stage-item ${item.state}`} key={item.label}>
						<b />
						<span>{item.label}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function ResultBox(props: {
	taskId: string | null;
	status: TaskStatus;
	result: RecognitionResult | null;
	rows: RecognitionRow[];
	downloadError: string | null;
	onDownload: () => void;
}) {
	if (props.status !== "done" || !props.result) {
		return (
			<div className="result-empty">
				<strong>Результат появится после обработки</strong>
				<span>Сначала будет доступна краткая статистика, затем скачивание CSV.</span>
			</div>
		);
	}

	const stats = props.result.stats || {};
	const rowsCount = stats.rows_count ?? stats.rowsCount ?? props.rows.length;
	const detected = stats.detected_count ?? stats.detectedCount ?? props.rows.length;
	const barcode = stats.barcode_count ?? stats.barcodeCount ?? "—";
	const qr = stats.qr_count ?? stats.qrCount ?? "—";

	return (
		<div className="result-box">
			<div className="result-metrics">
				<Fact label="ценников" value={detected} />
				<Fact label="строк" value={rowsCount} />
				<Fact label="barcode" value={barcode} />
				<Fact label="QR" value={qr} />
			</div>

			<button className="primary-btn full" type="button" onClick={props.onDownload}>
				Скачать CSV
			</button>
			{props.downloadError && <p className="error-text">{props.downloadError}</p>}
			{props.taskId && <p className="task-id">task: {props.taskId}</p>}

			<PreviewTable rows={props.rows} />
		</div>
	);
}

function PreviewTable({rows}: {rows: RecognitionRow[]}) {
	if (!rows.length) {
		return <p className="muted-note">Preview не передан. Файл CSV доступен для скачивания.</p>;
	}

	return (
		<div className="table-wrap">
			<table>
				<thead>
					<tr>
						{previewColumns.map((column) => (
							<th key={column}>{column}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.slice(0, 5).map((row, index) => (
						<tr key={`${row.barcode || row.id_sku || index}`}>
							{previewColumns.map((column) => (
								<td key={column}>{renderCell(row, column)}</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function MiniHistory({history, onOpen}: {history: HistoryItem[]; onOpen: () => void}) {
	return (
		<div className="mini-history">
			{history.slice(0, 5).map((item) => (
				<div className="mini-history-row" key={item.id}>
					<span>{item.fileName}</span>
					<b className={`status-badge status-badge--${item.status}`}>{statusToText(item.status)}</b>
				</div>
			))}
			<button className="link-btn" type="button" onClick={onOpen}>
				Вся история
			</button>
		</div>
	);
}

function HistoryPage({history, setPage}: {history: HistoryItem[]; setPage: (page: Page) => void}) {
	return (
		<section className="page-card">
			<div className="page-head">
				<div>
					<p className="section-label">Запуски</p>
					<h1>История обработки</h1>
				</div>
				<button className="primary-btn" type="button" onClick={() => setPage("work")}>
					Новый файл
				</button>
			</div>

			<div className="history-table-wrap">
				<table className="history-table">
					<thead>
						<tr>
							<th>Время</th>
							<th>Файл</th>
							<th>Статус</th>
							<th>Длительность</th>
							<th>Строки</th>
							<th>Barcode</th>
							<th>QR</th>
						</tr>
					</thead>
					<tbody>
						{history.map((item) => (
							<tr key={item.id}>
								<td>{item.startedAt}</td>
								<td>{item.fileName}</td>
								<td>
									<b className={`status-badge status-badge--${item.status}`}>{statusToText(item.status)}</b>
								</td>
								<td>{item.duration || "—"}</td>
								<td>{item.rows || "—"}</td>
								<td>{item.barcode || "—"}</td>
								<td>{item.qr || "—"}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}

function TeamPage() {
	return (
		<section className="page-card team-page">
			<div className="page-head">
				<div>
					<p className="section-label">Команда</p>
					<h1>Роли в проекте</h1>
				</div>
			</div>

			<div className="team-grid">
				{team.map((member, index) => (
					<article className="team-card" key={member.name}>
						<span>{String(index + 1).padStart(2, "0")}</span>
						<h2>{member.name}</h2>
						<strong>{member.role}</strong>
						<p>{member.zone}</p>
					</article>
				))}
			</div>
		</section>
	);
}

function BriefPage() {
	const workItems = [
		{icon: "▶", title: "Видео", text: "ролик со стеллажей, снятый роботом"},
		{icon: "⌑", title: "Детекция", text: "найти ценники на кадрах"},
		{icon: "T", title: "Текст", text: "извлечь название, цену, артикул"},
		{icon: "▦", title: "Коды", text: "распознать штрих-код и QR"},
		{icon: "CSV", title: "CSV", text: "сформировать строки с координатами и полями"},
		{icon: "⇩", title: "UI", text: "загрузка видео и скачивание результата"},
	];

	return (
		<section className="brief-board">
			<div className="brief-board-head">
				<h1>Задача: распознавание ценников по видео</h1>
			</div>

			<div className="brief-layout">
				<BriefCard
					title="1. Проблема и цель"
					items={[
						"цены на полке должны совпадать с учетными системами",
						"ошибки приводят к ручным проверкам и потере качества данных",
						"цель — извлекать данные с ценников из видео робота и выгружать результат в CSV",
					]}
				/>

				<article className="brief-card brief-card--tall">
					<h2>2. Что нужно сделать</h2>
					<div className="brief-icon-list">
						{workItems.map((item) => (
							<div className="brief-icon-row" key={item.title}>
								<span>{item.icon}</span>
								<div>
									<strong>{item.title}</strong>
									<p>{item.text}</p>
								</div>
							</div>
						))}
					</div>
				</article>

				<BriefCard
					title="3. Критерии успеха"
					items={[
						"главный критерий — качество распознавания не ниже 80%",
						"barcode — основной ключ сопоставления",
						"QR-код — приоритетная задача со звездочкой",
						"публичный интерфейс доступен без авторизации",
						"решение воспроизводимо в локальном контуре",
					]}
				/>

				<BriefCard
					title="4. Входные данные"
					items={[
						"видео с робота в торговом зале",
						"сцена фактически повернута на 90°",
						"возможны блики, тени и засветы",
						"ценники находятся на разной высоте и под разными углами",
						"расстояние до полки может отличаться",
					]}
				/>

				<article className="brief-card brief-card--wide pipeline-card">
					<h2>5. Архитектурный пайплайн</h2>
					<div className="pipeline-line">
						<PipelineStep icon="▶" title="Видео" note="входной файл" />
						<PipelineStep icon="▤" title="Кадры" note="отбор моментов" />
						<PipelineStep icon="⌑" title="Ценники" note="bbox" />
						<PipelineStep icon="T" title="OCR" note="текст" />
						<PipelineStep icon="▦" title="QR / barcode" note="ключи" />
						<PipelineStep icon="CSV" title="CSV" note="результат" />
					</div>
				</article>

				<BriefCard
					title="6. Ограничения"
					items={[
						"нельзя использовать внешние облачные AI API",
						"допустимы open-source модели и библиотеки",
						"ручная разметка не используется",
						"тяжелые модели нужно обосновать",
						"желателен запуск на ограниченных ресурсах",
					]}
				/>

				<BriefCard
					title="7. Выходные данные"
					items={[
						"одна строка — один найденный ценник",
						"filename, frame_timestamp и bbox-координаты",
						"товар, цены, скидка, артикул, штрихкод",
						"QR-поля с ценами, акциями и оптовыми уровнями",
						"CSV: UTF-8, разделитель — запятая",
					]}
				/>

				<BriefCard
					title="8. Масштабируемость"
					items={[
						"task-based API для независимых запусков",
						"очередь задач при слабом сервере",
						"CV-worker можно вынести на отдельную машину",
						"форматы ценников расширяются без переделки интерфейса",
						"фронт не зависит от конкретной модели распознавания",
					]}
				/>
			</div>
		</section>
	);
}

function BriefCard({title, items, wide = false}: {title: string; items: string[]; wide?: boolean}) {
	return (
		<article className={wide ? "brief-card brief-card--wide" : "brief-card"}>
			<h2>{title}</h2>
			<ul>
				{items.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
		</article>
	);
}

function PipelineStep({icon, title, note}: {icon: string; title: string; note: string}) {
	return (
		<div className="pipeline-step">
			<span>{icon}</span>
			<strong>{title}</strong>
			<small>{note}</small>
		</div>
	);
}

function Panel({title, number, className, children}: {title: string; number: string; className?: string; children: React.ReactNode}) {
	return (
		<section className={`panel ${className || ""}`}>
			<div className="panel-title">
				<span>{number}</span>
				<h2>{title}</h2>
			</div>
			{children}
		</section>
	);
}

function Fact({label, value}: {label: string; value: string | number}) {
	return (
		<div className="fact">
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

function Footer() {
	return (
		<footer className="footer">
			<div className="footer-inner">
				<span>ПолкаВоды</span>
				<span>2026</span>
			</div>
		</footer>
	);
}

function normalizeStatus(status: RecognitionResult["status"]): TaskStatus {
	if (status === "done") return "done";
	if (status === "error") return "error";
	if (status === "processing") return "processing";
	if (status === "queued") return "queued";
	return "processing";
}

function getRows(result: RecognitionResult | null): RecognitionRow[] {
	return result?.rows_preview || result?.rowsPreview || result?.rows || [];
}

function renderCell(row: RecognitionRow, column: string) {
	if (column === "bbox") {
		const parts = [row.x_min, row.y_min, row.x_max, row.y_max].map(toDisplayValue);
		return parts.every((part) => part === "—") ? "—" : parts.join(", ");
	}

	return toDisplayValue(row[column]);
}

function toDisplayValue(value: RecognitionRow[string]) {
	if (value === null || value === undefined || value === "") return "—";
	return String(value);
}

function getStages(status: TaskStatus) {
	const order = ["файл", "очередь", "обработка", "CSV"];
	const activeIndex = getActiveStepIndex(status);

	return order.map((label, index) => {
		if (status === "error") return {label, state: index <= activeIndex ? "error" : "waiting"};
		if (index < activeIndex || status === "done") return {label, state: "done"};
		if (index === activeIndex) return {label, state: "active"};
		return {label, state: "waiting"};
	});
}

function getActiveStepIndex(status: TaskStatus) {
	switch (status) {
		case "uploading":
			return 0;
		case "queued":
			return 1;
		case "processing":
			return 2;
		case "done":
			return 3;
		case "error":
			return 2;
		default:
			return -1;
	}
}

function getStatusTitle(status: TaskStatus) {
	switch (status) {
		case "selected":
			return "Файл выбран";
		case "uploading":
			return "Передаем файл";
		case "queued":
			return "Очередь";
		case "processing":
			return "Обработка";
		case "done":
			return "Готово";
		case "error":
			return "Ошибка";
		default:
			return "Ожидание";
	}
}

function getStatusText(status: TaskStatus) {
	switch (status) {
		case "selected":
			return "Файл готов к запуску.";
		case "uploading":
			return "Отправляем видео на сервер.";
		case "queued":
			return "Ждем свободный обработчик.";
		case "processing":
			return "Backend возвращает актуальный этап.";
		case "done":
			return "Файл CSV готов.";
		case "error":
			return "Повторите запуск или выберите другой файл.";
		default:
			return "Выберите видео.";
	}
}

function statusToText(status: TaskStatus) {
	switch (status) {
		case "done":
			return "готово";
		case "processing":
			return "в работе";
		case "queued":
			return "очередь";
		case "uploading":
			return "загрузка";
		case "error":
			return "ошибка";
		case "selected":
			return "выбран";
		default:
			return "ожидает";
	}
}

function formatDate(date: Date) {
	return new Intl.DateTimeFormat("ru-RU", {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function formatDuration(ms: number) {
	const seconds = Math.max(0, Math.round(ms / 1000));
	const minutes = Math.floor(seconds / 60);
	const rest = seconds % 60;

	if (!minutes) return `${rest} сек`;
	return `${minutes} мин ${rest} сек`;
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error) return error.message;
	return "Произошла неизвестная ошибка";
}
