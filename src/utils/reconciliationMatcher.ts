import {
  BankStatementEntry,
  FinancialPaymentChannel,
  Order,
  OrderFinancialRecord,
  StatementMatchConfidence,
  StatementMatchSuggestion,
} from '../types';
import {
  getEffectiveReconciliationStatus,
  isOrderEligibleForFinancial,
  toLocalDateInput,
} from './financialReconciliation';

function normalizeTokens(text: string): string[] {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !['pix', 'recebido', 'de', 'da', 'do', 'dos', 'das', 'ltda', 'me'].includes(t));
}

function dayDiff(dateA: string, dateB: string): number {
  const a = toLocalDateInput(dateA);
  const b = toLocalDateInput(dateB);
  if (!a || !b) return 999;
  const msA = new Date(`${a}T12:00:00Z`).getTime();
  const msB = new Date(`${b}T12:00:00Z`).getTime();
  if (!Number.isFinite(msA) || !Number.isFinite(msB)) return 999;
  return Math.abs(Math.round((msA - msB) / 86400000));
}

function isChannelCompatible(
  statementChannelName: string,
  orderMethod: Order['formaPagamento'],
  channels: FinancialPaymentChannel[]
): boolean {
  const ch = channels.find(
    c => c.nome.trim().toLowerCase() === statementChannelName.trim().toLowerCase()
  );
  const cat = ch?.categoria;
  if (cat === 'PIX' || /pix/i.test(statementChannelName)) return orderMethod === 'pix';
  if (cat === 'CARTAO' || /c6pay|sumup|rede|cartao/i.test(statementChannelName)) {
    return orderMethod === 'credito' || orderMethod === 'debito';
  }
  if (cat === 'BOLETO' || /boleto/i.test(statementChannelName)) {
    return String(orderMethod || '').toLowerCase() === 'boleto';
  }
  if (cat === 'DINHEIRO') return orderMethod === 'dinheiro';
  return false;
}

export function getOrderOpenBalance(
  order: Order,
  record?: OrderFinancialRecord
): number {
  const reconciledAmt = Math.max(0, Number(record?.valorConciliado) || 0);
  return Math.max(0, Number((order.valorTotal - reconciledAmt).toFixed(2)));
}

export function computeStatementSuggestions(
  statements: BankStatementEntry[],
  orders: Order[],
  financialRecords: OrderFinancialRecord[],
  channels: FinancialPaymentChannel[]
): Map<string, StatementMatchSuggestion> {
  const recordByOrderId = new Map(financialRecords.map(r => [r.pedidoId, r]));
  const openOrders = orders.filter(o => {
    if (!isOrderEligibleForFinancial(o)) return false;
    const rec = recordByOrderId.get(o.id);
    if (getEffectiveReconciliationStatus(o, rec) === 'CONCILIADO') return false;
    return getOrderOpenBalance(o, rec) > 0.01;
  });

  const result = new Map<string, StatementMatchSuggestion>();

  for (const st of statements) {
    if (st.status !== 'PENDENTE') {
      result.set(st.id, {
        statementId: st.id,
        confidence: 'EXATO',
        score: 100,
        matchedOrderIds: st.linkedOrderIds,
        reasons: ['Já conciliado'],
      });
      continue;
    }

    const stTokens = new Set([
      ...normalizeTokens(st.pagadorNome),
      ...normalizeTokens(st.descricao),
    ]);
    const isCardChannel = /c6pay|sumup|rede/i.test(st.canalNome);

    let bestSingle: { order: Order; score: number; reasons: string[] } | null = null;

    for (const ord of openOrders) {
      const rec = recordByOrderId.get(ord.id);
      const owed = getOrderOpenBalance(ord, rec);
      let score = 0;
      const reasons: string[] = [];

      const grossDiff = Math.abs(st.valorBruto - owed);
      const totalDiff = Math.abs(st.valorBruto - ord.valorTotal);

      // 1. Value (+50 exact, +35 MDR tolerance if net only, +22 partial/sinal match)
      if (grossDiff <= 0.02 || totalDiff <= 0.02) {
        score += 50;
        reasons.push('Valor bruto exato');
      } else if (st.valorTaxa === 0 && st.valorLiquido < owed) {
        const mdrRatio = (owed - st.valorLiquido) / Math.max(owed, 1);
        if (mdrRatio >= 0.008 && mdrRatio <= 0.065) {
          score += 35;
          reasons.push(`Compatível com taxa MDR (~${(mdrRatio * 100).toFixed(1)}%)`);
        } else if (st.valorBruto < owed && Math.abs(st.valorBruto / owed - 0.5) <= 0.02) {
          score += 24;
          reasons.push('Compatível com sinal de 50%');
        }
      } else if (st.valorBruto < owed && owed - st.valorBruto > 1) {
        // Possible partial/installment PIX when payer matches
        score += 18;
      }

      // 2. Channel (+20)
      if (isChannelCompatible(st.canalNome, ord.formaPagamento, channels)) {
        score += 20;
        reasons.push('Canal compatível');
      }

      // 3. Date proximity (+15)
      const dPed = dayDiff(st.dataExtrato, ord.dataPedido);
      const dEnt = dayDiff(st.dataExtrato, ord.dataHoraEntrega);
      const minDays = Math.min(dPed, dEnt);
      if (minDays <= 1) {
        score += 15;
        reasons.push('Data próxima (D+0/D+1)');
      } else if (minDays <= 3) {
        score += 10;
        reasons.push(`Data D+${minDays}`);
      } else if (isCardChannel && minDays <= 31) {
        score += 8;
        reasons.push(`Repasse cartão D+${minDays}`);
      }

      // 4. Customer name similarity (+15)
      const custTokens = normalizeTokens(ord.clienteNome);
      const overlap = custTokens.filter(t => stTokens.has(t));
      if (custTokens.length > 0 && overlap.length > 0) {
        const ratio = overlap.length / Math.min(custTokens.length, 2);
        const pts = Math.min(15, Math.round(15 * Math.min(1, ratio)));
        score += pts;
        if (pts >= 10) reasons.push('Nome do pagador compatível');
      }

      if (!bestSingle || score > bestSingle.score) {
        bestSingle = { order: ord, score, reasons };
      }
    }

    // Check 1:N combination (2 or 3 open orders summing up to statement grossAmount)
    let bestCombo: { orderIds: string[]; score: number; reasons: string[] } | null = null;
    if ((!bestSingle || bestSingle.score < 95) && openOrders.length >= 2) {
      const compatOrders = openOrders
        .filter(o => getOrderOpenBalance(o, recordByOrderId.get(o.id)) < st.valorBruto)
        .slice(0, 30);

      for (let i = 0; i < compatOrders.length; i += 1) {
        const o1 = compatOrders[i];
        const b1 = getOrderOpenBalance(o1, recordByOrderId.get(o1.id));
        for (let j = i + 1; j < compatOrders.length; j += 1) {
          const o2 = compatOrders[j];
          const b2 = getOrderOpenBalance(o2, recordByOrderId.get(o2.id));
          if (Math.abs(b1 + b2 - st.valorBruto) <= 0.02) {
            const bothCompat =
              isChannelCompatible(st.canalNome, o1.formaPagamento, channels) &&
              isChannelCompatible(st.canalNome, o2.formaPagamento, channels);
            const comboScore = 65 + (bothCompat ? 20 : 8);
            if (!bestCombo || comboScore > bestCombo.score) {
              bestCombo = {
                orderIds: [o1.id, o2.id],
                score: comboScore,
                reasons: ['Soma exata de 2 pedidos (1:N)'],
              };
            }
          }
        }
      }
    }

    if (bestCombo && (!bestSingle || bestCombo.score > bestSingle.score)) {
      const confidence: StatementMatchConfidence =
        bestCombo.score >= 95 ? 'EXATO' : bestCombo.score >= 70 ? 'PROVAVEL' : 'SEM_MATCH';
      result.set(st.id, {
        statementId: st.id,
        confidence,
        score: bestCombo.score,
        matchedOrderIds: bestCombo.orderIds,
        reasons: bestCombo.reasons,
      });
    } else if (bestSingle && bestSingle.score >= 45) {
      const confidence: StatementMatchConfidence =
        bestSingle.score >= 95 ? 'EXATO' : bestSingle.score >= 70 ? 'PROVAVEL' : 'SEM_MATCH';
      result.set(st.id, {
        statementId: st.id,
        confidence,
        score: bestSingle.score,
        matchedOrderIds: [bestSingle.order.id],
        reasons: bestSingle.reasons,
      });
    } else {
      result.set(st.id, {
        statementId: st.id,
        confidence: 'SEM_MATCH',
        score: bestSingle?.score || 0,
        matchedOrderIds: [],
        reasons: ['Sem correspondência automática'],
      });
    }
  }

  return result;
}
