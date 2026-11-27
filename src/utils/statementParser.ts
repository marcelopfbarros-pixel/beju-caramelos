import * as XLSX from 'xlsx';
import { StatementFormat } from '../types';

export type StatementPresetId = 'BEJU_MODEL' | 'C6_OFX' | 'C6_CSV' | 'C6PAY_CSV' | 'SUMUP_CSV' | 'REDE_CSV' | 'MANUAL';

export interface ParsedStatementRow {
  dataExtrato: string; // YYYY-MM-DD
  competencia: string; // YYYY-MM
  canalOverride?: string;
  pagadorNome: string;
  descricao: string;
  referenciaNsu: string;
  valorBruto: number;
  valorTaxa: number;
  valorLiquido: number;
  fingerprintHash: string;
}

export interface ManualColumnMapping {
  dateCol: number;
  amountCol: number;
  payerCol?: number;
  descCol?: number;
  refCol?: number;
  feeCol?: number;
  netCol?: number;
  channelCol?: number;
  headerRowIdx: number;
}

export interface StatementParseResult {
  format: StatementFormat;
  detectedPreset: StatementPresetId;
  rows: ParsedStatementRow[];
  debitsSkipped: number;
  emptyRowsSkipped: number;
  rawHeaders: string[];
  headerRowIdx: number;
  previewMatrix: string[][];
}

export function normalizeHeaderToken(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function deriveCompetencia(dateIso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(dateIso);
  if (m) return `${m[1]}-${m[2]}`;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function computeStatementFingerprint(
  canalNome: string,
  dataIso: string,
  valorBruto: number,
  referenciaOrDesc: string
): string {
  const canalKey = normalizeHeaderToken(canalNome).replace(/\s+/g, '');
  const cents = Math.round(valorBruto * 100);
  const refNorm = normalizeHeaderToken(referenciaOrDesc).replace(/\s+/g, '').slice(0, 48) || 'semref';
  return `${canalKey}|${dataIso}|${cents}|${refNorm}`;
}

export function parseLocalizedCurrency(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? Number(val.toFixed(2)) : NaN;
  }
  const raw = String(val ?? '').trim();
  if (!raw) return NaN;
  // Detect parenthetical negatives e.g. "(120,00)"
  const isParenNeg = /^\(.*\)$/.test(raw);
  let cleaned = raw.replace(/[()R$\s]/gi, '');
  const hasMinus = cleaned.startsWith('-');
  cleaned = cleaned.replace(/^-/, '');

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // pt-BR: 1.234,56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // en-US: 1,234.56
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    cleaned = cleaned.replace(',', '.');
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return NaN;
  const signed = isParenNeg || hasMinus ? -Math.abs(parsed) : parsed;
  return Number(signed.toFixed(2));
}

function todayLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function parseFlexibleDateToIso(val: unknown): string | null {
  if (typeof val === 'number' && val > 20000 && val < 90000) {
    // Excel serial date
    const utcMs = Math.round((val - 25569) * 86400 * 1000);
    const d = new Date(utcMs);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
        d.getUTCDate()
      ).padStart(2, '0')}`;
    }
  }

  const s = String(val ?? '').trim();
  if (!s) return null;

  // YYYYMMDD (OFX DTPOSTED: e.g. 20261126142200[-3:BRT])
  const ofxMatch = /^(\d{4})(\d{2})(\d{2})/.exec(s);
  if (ofxMatch) {
    return `${ofxMatch[1]}-${ofxMatch[2]}-${ofxMatch[3]}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY (with optional time)
  const brMatch = /^(\d{2})[/.-](\d{2})[/.-](\d{4})/.exec(s);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }

  // YYYY-MM-DD (local date only; timezone-aware ISO falls through to Date parsing)
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
  if (isoMatch && !hasTz) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(
      parsed.getDate()
    ).padStart(2, '0')}`;
  }

  return null;
}

function extractOfxTag(block: string, tag: string): string {
  const xmlRe = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const xmlHit = xmlRe.exec(block);
  if (xmlHit) return xmlHit[1].trim();
  const sgmlRe = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
  const sgmlHit = sgmlRe.exec(block);
  return sgmlHit ? sgmlHit[1].trim() : '';
}

function extractPayerFromMemo(memo: string, nameTag: string): string {
  const cleanName = nameTag.trim();
  if (cleanName && !/^pix\s*(recebido|enviado)?$/i.test(cleanName)) {
    return cleanName.toUpperCase();
  }
  const m = memo
    .replace(/^pix\s*(recebido|transf|transferencia)\s*[-:•]?\s*/i, '')
    .trim();
  return (m || memo || 'PAGADOR NÃO IDENTIFICADO').toUpperCase();
}

export function parseOfxStatement(rawText: string, defaultCanalNome: string): StatementParseResult {
  const blocks: string[] = [];
  const blockRe = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>))/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(rawText)) !== null) {
    blocks.push(match[1]);
  }

  const rows: ParsedStatementRow[] = [];
  let debitsSkipped = 0;

  blocks.forEach((blk, idx) => {
    const trnAmtRaw = extractOfxTag(blk, 'TRNAMT');
    const amount = parseLocalizedCurrency(trnAmtRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      if (Number.isFinite(amount) && amount < 0) debitsSkipped += 1;
      return;
    }

    const dtPosted = extractOfxTag(blk, 'DTPOSTED');
    const dataExtrato = parseFlexibleDateToIso(dtPosted) || todayLocalIso();
    const fitId = extractOfxTag(blk, 'FITID') || `OFX-${idx + 1}`;
    const memo = extractOfxTag(blk, 'MEMO');
    const nameTag = extractOfxTag(blk, 'NAME');
    const pagadorNome = extractPayerFromMemo(memo, nameTag);
    const descricao = memo || nameTag || `Lançamento ${defaultCanalNome}`;

    rows.push({
      dataExtrato,
      competencia: deriveCompetencia(dataExtrato),
      pagadorNome,
      descricao,
      referenciaNsu: fitId,
      valorBruto: amount,
      valorTaxa: 0,
      valorLiquido: amount,
      fingerprintHash: computeStatementFingerprint(defaultCanalNome, dataExtrato, amount, `${fitId}|${descricao}`),
    });
  });

  return {
    format: 'OFX',
    detectedPreset: 'C6_OFX',
    rows,
    debitsSkipped,
    emptyRowsSkipped: 0,
    rawHeaders: ['Data', 'Pagador', 'Descrição', 'Valor Bruto', 'Cód. Transação'],
    headerRowIdx: 0,
    previewMatrix: rows.slice(0, 5).map(r => [r.dataExtrato, r.pagadorNome, r.descricao, String(r.valorBruto), r.referenciaNsu]),
  };
}

function findColumnIndex(headersNorm: string[], candidates: string[]): number {
  for (const cand of candidates) {
    const idx = headersNorm.findIndex(h => h === cand);
    if (idx !== -1) return idx;
  }
  for (const cand of candidates) {
    const idx = headersNorm.findIndex(h => h.includes(cand));
    if (idx !== -1) return idx;
  }
  return -1;
}

function detectHeaderAndPreset(matrix: unknown[][], hintChannel: string): {
  headerRowIdx: number;
  headers: string[];
  mapping: ManualColumnMapping;
  preset: StatementPresetId;
} {
  const maxScan = Math.min(matrix.length, 10);
  let bestRowIdx = 0;
  let bestScore = -1;

  for (let r = 0; r < maxScan; r += 1) {
    const row = matrix[r] || [];
    const normCells = row.map(normalizeHeaderToken);
    let score = 0;
    if (normCells.some(c => /^(data|date|dt)/.test(c) || c.includes('data da venda') || c.includes('data do lancamento'))) score += 3;
    if (normCells.some(c => c.includes('valor') || c.includes('bruto') || c.includes('amount') || c.includes('total'))) score += 3;
    if (normCells.some(c => c.includes('nsu') || c.includes('codigo') || c.includes('cod transacao') || c.includes('rv') || c.includes('tid') || c.includes('id'))) score += 2;
    if (normCells.some(c => c.includes('pagador') || c.includes('descricao') || c.includes('bandeira') || c.includes('cliente') || c.includes('historico'))) score += 2;
    if (score > bestScore) {
      bestScore = score;
      bestRowIdx = r;
    }
  }

  const rawRow = matrix[bestRowIdx] || [];
  const headers = rawRow.map((c, idx) => String(c ?? '').trim() || `Coluna ${idx + 1}`);
  const norm = headers.map(normalizeHeaderToken);

  const dateCol = findColumnIndex(norm, [
    'data',
    'data extrato',
    'data da venda',
    'data venda',
    'data credito',
    'data pagamento',
    'data lancamento',
    'dt',
    'date',
  ]);
  const amountCol = findColumnIndex(norm, [
    'valor bruto',
    'valor venda',
    'valor original',
    'valor',
    'entrada',
    'credito',
    'bruto',
    'amount',
    'total',
  ]);
  const netCol = findColumnIndex(norm, ['valor liquido', 'liquido', 'valor depositado', 'valor repasse', 'net']);
  const feeCol = findColumnIndex(norm, ['taxa mdr', 'taxa', 'desconto mdr', 'tarifa', 'fee']);
  const payerCol = findColumnIndex(norm, ['pagador', 'cliente', 'bandeira', 'titular', 'origem', 'modalidade']);
  const descCol = findColumnIndex(norm, ['descricao', 'historico', 'detalhes', 'tipo operacao', 'memo', 'lancamento']);
  const refCol = findColumnIndex(norm, [
    'cod transacao',
    'codigo transacao',
    'referencia',
    'nsu',
    'rv',
    'numero rv',
    'tid',
    'id transacao',
    'documento',
    'autenticacao',
  ]);
  const channelCol = findColumnIndex(norm, ['canal', 'meio', 'forma pagamento', 'adquirente']);

  let preset: StatementPresetId = 'MANUAL';
  const hint = normalizeHeaderToken(hintChannel);
  if (
    norm.includes('valor bruto') &&
    norm.includes('taxa mdr') &&
    norm.includes('cod transacao')
  ) {
    preset = 'BEJU_MODEL';
  } else if (hint.includes('rede') || norm.some(h => h.includes('numero rv') || h === 'rv')) {
    preset = 'REDE_CSV';
  } else if (hint.includes('sumup') || norm.some(h => h.includes('sumup'))) {
    preset = 'SUMUP_CSV';
  } else if (hint.includes('c6pay') || norm.some(h => h.includes('c6pay') || h.includes('nsu'))) {
    preset = 'C6PAY_CSV';
  } else if (dateCol !== -1 && (amountCol !== -1 || netCol !== -1)) {
    preset = hint.includes('pix') ? 'C6_CSV' : 'C6_CSV';
  }

  return {
    headerRowIdx: bestRowIdx,
    headers,
    preset: dateCol === -1 || (amountCol === -1 && netCol === -1) ? 'MANUAL' : preset,
    mapping: {
      dateCol,
      amountCol: amountCol !== -1 ? amountCol : netCol,
      payerCol: payerCol !== -1 ? payerCol : undefined,
      descCol: descCol !== -1 ? descCol : undefined,
      refCol: refCol !== -1 ? refCol : undefined,
      feeCol: feeCol !== -1 ? feeCol : undefined,
      netCol: netCol !== -1 ? netCol : undefined,
      channelCol: channelCol !== -1 ? channelCol : undefined,
      headerRowIdx: bestRowIdx,
    },
  };
}

export function parseMatrixWithMapping(
  matrix: unknown[][],
  mapping: ManualColumnMapping,
  defaultCanalNome: string,
  format: StatementFormat,
  detectedPreset: StatementPresetId,
  headers: string[]
): StatementParseResult {
  const rows: ParsedStatementRow[] = [];
  let debitsSkipped = 0;
  let emptyRowsSkipped = 0;

  for (let r = mapping.headerRowIdx + 1; r < matrix.length; r += 1) {
    const row = matrix[r] || [];
    const hasAnyValue = row.some(cell => String(cell ?? '').trim() !== '');
    if (!hasAnyValue) {
      emptyRowsSkipped += 1;
      continue;
    }

    if (mapping.dateCol < 0 || mapping.amountCol < 0) {
      emptyRowsSkipped += 1;
      continue;
    }

    const rawDate = row[mapping.dateCol];
    const rawAmount = row[mapping.amountCol];
    const dataExtrato = parseFlexibleDateToIso(rawDate);
    let valorBruto = parseLocalizedCurrency(rawAmount);
    const parsedNet =
      mapping.netCol !== undefined && mapping.netCol >= 0 ? parseLocalizedCurrency(row[mapping.netCol]) : NaN;
    const parsedFee =
      mapping.feeCol !== undefined && mapping.feeCol >= 0 ? parseLocalizedCurrency(row[mapping.feeCol]) : NaN;

    if (!Number.isFinite(valorBruto) && Number.isFinite(parsedNet)) {
      valorBruto = Number((parsedNet + (Number.isFinite(parsedFee) ? Math.abs(parsedFee) : 0)).toFixed(2));
    }

    if (!dataExtrato && !Number.isFinite(valorBruto)) {
      emptyRowsSkipped += 1;
      continue;
    }

    if (!Number.isFinite(valorBruto) || valorBruto <= 0) {
      if (Number.isFinite(valorBruto) && valorBruto < 0) debitsSkipped += 1;
      else emptyRowsSkipped += 1;
      continue;
    }

    const safeDate = dataExtrato || todayLocalIso();
    const canalOverride =
      mapping.channelCol !== undefined ? String(row[mapping.channelCol] ?? '').trim() || undefined : undefined;
    const effectiveCanal = canalOverride || defaultCanalNome;

    const rawPayer = mapping.payerCol !== undefined ? String(row[mapping.payerCol] ?? '').trim() : '';
    const rawDesc = mapping.descCol !== undefined ? String(row[mapping.descCol] ?? '').trim() : '';
    const rawRef = mapping.refCol !== undefined ? String(row[mapping.refCol] ?? '').trim() : '';

    const pagadorNome = (rawPayer || rawDesc || `CRÉDITO ${effectiveCanal}`).toUpperCase();
    const descricao = rawDesc || rawPayer || `Lançamento ${effectiveCanal}`;

    let valorTaxa = Number.isFinite(parsedFee) ? Math.max(0, Math.abs(parsedFee)) : 0;
    let valorLiquido = Number.isFinite(parsedNet)
      ? Math.max(0, parsedNet)
      : Math.max(0, Number((valorBruto - valorTaxa).toFixed(2)));
    if (!Number.isFinite(parsedFee) && Number.isFinite(parsedNet) && valorBruto >= parsedNet) {
      valorTaxa = Number((valorBruto - parsedNet).toFixed(2));
    }
    if (valorLiquido > valorBruto) {
      valorLiquido = valorBruto;
    }

    const referenciaNsu = rawRef || `${normalizeHeaderToken(effectiveCanal).toUpperCase().replace(/\s+/g, '')}-${safeDate.replace(/-/g, '')}-${r + 1}`;
    const fingerprintHash = computeStatementFingerprint(
      effectiveCanal,
      safeDate,
      valorBruto,
      rawRef || `${pagadorNome}|${descricao}`
    );

    rows.push({
      dataExtrato: safeDate,
      competencia: deriveCompetencia(safeDate),
      canalOverride,
      pagadorNome,
      descricao,
      referenciaNsu,
      valorBruto,
      valorTaxa,
      valorLiquido,
      fingerprintHash,
    });
  }

  return {
    format,
    detectedPreset,
    rows,
    debitsSkipped,
    emptyRowsSkipped,
    rawHeaders: headers,
    headerRowIdx: mapping.headerRowIdx,
    previewMatrix: matrix
      .slice(mapping.headerRowIdx + 1, mapping.headerRowIdx + 6)
      .map(r => r.map(c => String(c ?? ''))),
  };
}

export function parseWorkbookBufferStatement(
  buffer: ArrayBuffer | Uint8Array,
  format: 'CSV' | 'XLSX',
  defaultCanalNome: string,
  manualMapping?: ManualColumnMapping
): StatementParseResult {
  const wb = XLSX.read(buffer, { type: 'array' });
  const targetSheetName =
    wb.SheetNames.find(n => normalizeHeaderToken(n).includes('extrato')) || wb.SheetNames[0];
  const ws = wb.Sheets[targetSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

  const detected = detectHeaderAndPreset(matrix, defaultCanalNome);
  const mapping = manualMapping || detected.mapping;
  return parseMatrixWithMapping(
    matrix,
    mapping,
    defaultCanalNome,
    format,
    manualMapping ? 'MANUAL' : detected.preset,
    detected.headers
  );
}

export function decodeCsvBufferToArray(buffer: ArrayBuffer): Uint8Array {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  if (utf8.includes('\uFFFD')) {
    const latin1 = new TextDecoder('iso-8859-1').decode(buffer);
    return new TextEncoder().encode(latin1);
  }
  return new Uint8Array(buffer);
}

export async function parseStatementFile(
  file: File,
  defaultCanalNome: string,
  manualMapping?: ManualColumnMapping
): Promise<StatementParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'ofx' || ext === 'qfx') {
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    if (text.includes('\uFFFD')) {
      text = new TextDecoder('iso-8859-1').decode(buf);
    }
    return parseOfxStatement(text, defaultCanalNome);
  }

  const buffer = await file.arrayBuffer();
  if (ext === 'csv' || ext === 'txt') {
    const bytes = decodeCsvBufferToArray(buffer);
    return parseWorkbookBufferStatement(bytes, 'CSV', defaultCanalNome, manualMapping);
  }

  return parseWorkbookBufferStatement(buffer, 'XLSX', defaultCanalNome, manualMapping);
}
