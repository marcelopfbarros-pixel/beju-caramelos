import React, { useEffect, useMemo, useState } from 'react';
import {
  BankStatementEntry,
  FinancialPaymentChannel,
  InvoiceStatus,
  Order,
  OrderFinancialPaymentEntry,
  OrderFinancialRecord,
  PaymentStatus,
  ReconciliationPeriodLock,
  StatementImportBatch,
  UserProfile,
} from '../types';
import { formatCurrencyBR } from './CurrencyInput';
import {
  deriveReconciliationState,
  formatDateBR,
  getEffectiveInvoiceStatus,
  getEffectiveReconciliationStatus,
  isOrderEligibleForFinancial,
} from '../utils/financialReconciliation';
import { ParsedStatementRow } from '../utils/statementParser';
import {
  computeStatementSuggestions,
  getOrderOpenBalance,
} from '../utils/reconciliationMatcher';
import { formatCompetenciaLabel } from '../utils/conciliacaoReportExcel';
import { SupabaseService } from '../services/supabaseService';
import { ImportarExtratoModal } from './ImportarExtratoModal';
import { ConciliacaoReportModal } from './ConciliacaoReportModal';
import {
  CheckCircle2,
  ChevronDown,
  FileText,
  Lock,
  LockOpen,
  RotateCcw,
  Search,
  Upload,
  X,
} from 'lucide-react';

interface ConciliacaoTabProps {
  orders: Order[];
  financialChannels: FinancialPaymentChannel[];
  financialRecords: OrderFinancialRecord[];
  userProfile: UserProfile;
  onSaveFinancialRecord: (
    record: OrderFinancialRecord,
    orderPaymentSync?: { statusPagamento: PaymentStatus; valorPago: number }
  ) => Promise<void> | void;
  onVerifyPin?: (pin: string) => Promise<boolean>;
  getOrderRowMetrics: (
    order: Order,
    record?: OrderFinancialRecord
  ) => {
    entries: OrderFinancialPaymentEntry[];
    entriesTotal: number;
    draftTotals: { hasBonificado: boolean };
    saldoDevedor: number;
  };
  renderConciliationToggle: (
    order: Order,
    record: OrderFinancialRecord | undefined,
    isConciliated: boolean,
    isSaving: boolean,
    canCheck?: boolean,
    isLockedByNf?: boolean
  ) => React.ReactNode;
  renderInvoiceToggle: (
    order: Order,
    record: OrderFinancialRecord | undefined,
    nfStatus: InvoiceStatus,
    isSaving: boolean,
    canToggleInvoice?: boolean
  ) => React.ReactNode;
  moduleTabs?: React.ReactNode;
}

type ConciliacaoSubTab = 'PENDENTE' | 'CONCILIADO' | 'IGNORADO';

const CHANNEL_BADGE_MAP: Record<string, string> = {
  pixc6: 'bg-teal-50 text-teal-800 border-teal-200',
  c6pay: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  sumup: 'bg-sky-50 text-sky-800 border-sky-200',
  rede: 'bg-orange-50 text-orange-800 border-orange-200',
  boleto: 'bg-amber-50 text-amber-800 border-amber-200',
};

function channelBadgeClass(nome: string): string {
  const k = nome.trim().toLowerCase().replace(/\s+/g, '');
  return CHANNEL_BADGE_MAP[k] || 'bg-slate-100 text-slate-800 border-slate-200';
}

function getCurrentCompetencia(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const ConciliacaoTab: React.FC<ConciliacaoTabProps> = ({
  orders,
  financialChannels,
  financialRecords,
  userProfile,
  onSaveFinancialRecord,
  onVerifyPin,
  getOrderRowMetrics,
  renderConciliationToggle,
  renderInvoiceToggle,
  moduleTabs,
}) => {
  const [statements, setStatements] = useState<BankStatementEntry[]>([]);
  const [periodLocks, setPeriodLocks] = useState<ReconciliationPeriodLock[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const [competencia, setCompetencia] = useState<string>(() => getCurrentCompetencia());
  const [subTab, setSubTab] = useState<ConciliacaoSubTab>('PENDENTE');
  const [channelFilter, setChannelFilter] = useState<string>('TODOS');
  const [searchStatements, setSearchStatements] = useState('');
  const [searchOrders, setSearchOrders] = useState('');

  const [selectedStatementIds, setSelectedStatementIds] = useState<Set<string>>(new Set());
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [busyAction, setBusyAction] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Ignore reason modal
  const [isIgnoreModalOpen, setIsIgnoreModalOpen] = useState(false);
  const [ignoreReason, setIgnoreReason] = useState('Estorno / Devolução');

  // Lock / Unlock Period Modals
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockPin, setUnlockPin] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [verifyingUnlock, setVerifyingUnlock] = useState(false);

  const operatorLabel = useMemo(
    () => `${userProfile.nome || userProfile.email} (${userProfile.role})`,
    [userProfile.nome, userProfile.email, userProfile.role]
  );

  const notify = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(prev => (prev === msg ? null : prev));
    }, 3500);
  };

  useEffect(() => {
    if (!SupabaseService.isConfigured()) return;
    let active = true;
    setLoadingData(true);
    Promise.all([
      SupabaseService.getStatementEntries(),
      SupabaseService.getReconciliationPeriodLocks(),
    ])
      .then(([loadedStatements, loadedLocks]) => {
        if (!active) return;
        setStatements(loadedStatements);
        setPeriodLocks(loadedLocks);
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const recordByOrderId = useMemo(
    () => new Map(financialRecords.map(r => [r.pedidoId, r])),
    [financialRecords]
  );

  const channelByNameLower = useMemo(
    () => new Map(financialChannels.map(c => [c.nome.trim().toLowerCase(), c])),
    [financialChannels]
  );

  const availableCompetencias = useMemo(() => {
    const set = new Set<string>([getCurrentCompetencia()]);
    statements.forEach(s => {
      if (s.competencia) set.add(s.competencia);
    });
    periodLocks.forEach(p => {
      if (p.competencia) set.add(p.competencia);
    });
    orders.forEach(o => {
      const m = (o.dataPedido || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(m)) set.add(m);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [statements, periodLocks, orders]);

  const activePeriodLock = useMemo(
    () => periodLocks.find(p => p.competencia === competencia),
    [periodLocks, competencia]
  );
  const isPeriodLocked = activePeriodLock?.status === 'FECHADO';

  const existingFingerprints = useMemo(
    () => new Set(statements.map(s => s.fingerprintHash)),
    [statements]
  );

  const suggestionsMap = useMemo(
    () => computeStatementSuggestions(statements, orders, financialRecords, financialChannels),
    [statements, orders, financialRecords, financialChannels]
  );

  const compStatements = useMemo(
    () => statements.filter(s => s.competencia === competencia),
    [statements, competencia]
  );

  const kpiStats = useMemo(() => {
    const active = compStatements.filter(s => s.status !== 'IGNORADO');
    const conc = compStatements.filter(s => s.status === 'CONCILIADO');
    const pend = compStatements.filter(s => s.status === 'PENDENTE' || s.status === 'PARCIAL');
    const totalBruto = active.reduce((a, s) => a + s.valorBruto, 0);
    const totalConc = conc.reduce((a, s) => a + s.valorBruto, 0);
    const totalPend = pend.reduce((a, s) => a + s.valorBruto, 0);
    const pct = totalBruto > 0 ? Math.round((totalConc / totalBruto) * 100) : 0;

    const openOrders = orders.filter(o => {
      if (!isOrderEligibleForFinancial(o)) return false;
      const rec = recordByOrderId.get(o.id);
      return getOrderOpenBalance(o, rec) > 0.01;
    });
    const openOrdersSum = openOrders.reduce(
      (a, o) => a + getOrderOpenBalance(o, recordByOrderId.get(o.id)),
      0
    );

    return {
      activeCount: active.length,
      totalBruto,
      concCount: conc.length,
      totalConc,
      pct,
      pendCount: pend.length,
      totalPend,
      ignCount: compStatements.filter(s => s.status === 'IGNORADO').length,
      openOrders,
      openOrdersSum,
      exactCount: pend.filter(s => suggestionsMap.get(s.id)?.confidence === 'EXATO').length,
    };
  }, [compStatements, orders, recordByOrderId, suggestionsMap]);

  const filteredStatements = useMemo(() => {
    const q = searchStatements.trim().toLowerCase();
    return compStatements.filter(s => {
      const targetMatch =
        subTab === 'PENDENTE'
          ? s.status === 'PENDENTE' || s.status === 'PARCIAL'
          : s.status === subTab;
      if (!targetMatch) return false;
      if (
        channelFilter !== 'TODOS' &&
        s.canalNome.trim().toLowerCase() !== channelFilter.trim().toLowerCase()
      ) {
        return false;
      }
      if (q) {
        const hit =
          s.pagadorNome.toLowerCase().includes(q) ||
          s.descricao.toLowerCase().includes(q) ||
          s.referenciaNsu.toLowerCase().includes(q) ||
          String(s.valorBruto).includes(q) ||
          formatCurrencyBR(s.valorBruto).toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [compStatements, subTab, channelFilter, searchStatements]);

  const suggestedOrderIdsSet = useMemo(() => {
    const set = new Set<string>();
    selectedStatementIds.forEach(stId => {
      const sug = suggestionsMap.get(stId);
      sug?.matchedOrderIds.forEach(oid => set.add(oid));
    });
    return set;
  }, [selectedStatementIds, suggestionsMap]);

  const filteredOpenOrders = useMemo(() => {
    const q = searchOrders.trim().toLowerCase();
    const list = kpiStats.openOrders.filter(o => {
      if (!q) return true;
      return (
        o.numeroPedido.toLowerCase().includes(q) ||
        o.clienteNome.toLowerCase().includes(q) ||
        String(o.valorTotal).includes(q) ||
        formatCurrencyBR(o.valorTotal).toLowerCase().includes(q)
      );
    });
    return [...list].sort((a, b) => {
      const aTop = selectedOrderIds.has(a.id) || suggestedOrderIdsSet.has(a.id) ? 0 : 1;
      const bTop = selectedOrderIds.has(b.id) || suggestedOrderIdsSet.has(b.id) ? 0 : 1;
      if (aTop !== bTop) return aTop - bTop;
      return (b.dataPedido || '').localeCompare(a.dataPedido || '');
    });
  }, [kpiStats.openOrders, searchOrders, selectedOrderIds, suggestedOrderIdsSet]);

  const toggleStatementCheck = (stId: string, checked: boolean) => {
    if (isPeriodLocked) return;
    const nextStIds = new Set(selectedStatementIds);
    const nextOrdIds = new Set(selectedOrderIds);
    const sug = suggestionsMap.get(stId);

    if (checked) {
      nextStIds.add(stId);
      sug?.matchedOrderIds.forEach(oid => {
        const ord = kpiStats.openOrders.find(x => x.id === oid);
        if (ord) nextOrdIds.add(oid);
      });
    } else {
      nextStIds.delete(stId);
      const stillSuggested = new Set<string>();
      nextStIds.forEach(otherId => {
        suggestionsMap.get(otherId)?.matchedOrderIds.forEach(oid => stillSuggested.add(oid));
      });
      sug?.matchedOrderIds.forEach(oid => {
        if (!stillSuggested.has(oid)) nextOrdIds.delete(oid);
      });
    }

    setSelectedStatementIds(nextStIds);
    setSelectedOrderIds(nextOrdIds);
  };

  const applyReconciliationToOrders = async (
    allocations: Array<{ statement: BankStatementEntry; order: Order; amount: number }>
  ) => {
    // Group allocations by order so we save each order's updated OrderFinancialRecord cleanly
    const allocsByOrder = new Map<
      string,
      Array<{ statement: BankStatementEntry; amount: number }>
    >();
    for (const item of allocations) {
      const arr = allocsByOrder.get(item.order.id) || [];
      arr.push({ statement: item.statement, amount: item.amount });
      allocsByOrder.set(item.order.id, arr);
    }

    for (const [orderId, orderAllocs] of allocsByOrder.entries()) {
      const order = orders.find(o => o.id === orderId);
      if (!order) continue;
      const existingRec = recordByOrderId.get(orderId);
      const baseEntries: OrderFinancialPaymentEntry[] = existingRec?.lancamentos?.length
        ? existingRec.lancamentos.map(e => ({ ...e }))
        : existingRec &&
          (existingRec.meioPagamentoNome || existingRec.dataExtrato || existingRec.valorConciliado > 0)
        ? [
            {
              id: `ent-base-${Date.now()}`,
              dataPagamento: existingRec.dataPagamento || '',
              dataExtrato: existingRec.dataExtrato || '',
              meioPagamentoId: existingRec.meioPagamentoId,
              meioPagamentoNome: existingRec.meioPagamentoNome || '',
              valor: existingRec.valorConciliado || 0,
              referenciaExtrato: existingRec.referenciaExtrato,
            },
          ]
        : [];

      const newEntries: OrderFinancialPaymentEntry[] = orderAllocs.map(({ statement, amount }) => {
        const ch =
          (statement.canalId ? financialChannels.find(c => c.id === statement.canalId) : undefined) ||
          channelByNameLower.get(statement.canalNome.trim().toLowerCase());
        return {
          id: `ext-${statement.id}`,
          dataPagamento: statement.dataExtrato,
          dataExtrato: statement.dataExtrato,
          meioPagamentoId: ch?.id || statement.canalId,
          meioPagamentoNome: ch?.nome || statement.canalNome,
          valor: Number(amount.toFixed(2)),
          referenciaExtrato: statement.id,
        };
      });

      const mergedEntries = [...baseEntries, ...newEntries];
      const prelim = deriveReconciliationState(order, mergedEntries, financialChannels, true);
      const covered100 = prelim.canMarkConciliated;
      const derived = deriveReconciliationState(order, mergedEntries, financialChannels, covered100);
      const primary = mergedEntries[0];

      const nextRecord: OrderFinancialRecord = {
        id: existingRec?.id || `fin-${order.id}-${Date.now()}`,
        pedidoId: order.id,
        conciliacaoStatus: derived.conciliacaoStatus,
        meioPagamentoId: primary?.meioPagamentoId,
        meioPagamentoNome: primary?.meioPagamentoNome,
        dataPagamento: primary?.dataPagamento,
        dataExtrato: primary?.dataExtrato,
        valorConciliado: derived.valorConciliado,
        lancamentos: mergedEntries,
        referenciaExtrato: primary?.referenciaExtrato,
        nfStatus: existingRec?.nfStatus || 'PENDENTE',
        nfDataEmissao: existingRec?.nfDataEmissao,
        nfObservacoes: existingRec?.nfObservacoes,
        observacoes: existingRec?.observacoes,
        atualizadoPor: operatorLabel,
      };

      const totalPaid = Number(
        mergedEntries.reduce((sum, ent) => sum + (Number(ent.valor) || 0), 0).toFixed(2)
      );
      const orderPaymentSync: { statusPagamento: PaymentStatus; valorPago: number } = {
        statusPagamento: covered100 ? 'PAGO' : totalPaid > 0 ? 'SINAL' : 'PENDENTE',
        valorPago: Math.min(order.valorTotal, totalPaid),
      };

      await onSaveFinancialRecord(nextRecord, orderPaymentSync);
    }
  };

  const handleConfirmManualReconcile = async () => {
    if (isPeriodLocked || busyAction) return;
    const sts = compStatements.filter(
      s => (s.status === 'PENDENTE' || s.status === 'PARCIAL') && selectedStatementIds.has(s.id)
    );
    const ords = kpiStats.openOrders.filter(o => selectedOrderIds.has(o.id));
    if (sts.length === 0 || ords.length === 0) return;

    const remainingByOrder = new Map(
      ords.map(o => [o.id, getOrderOpenBalance(o, recordByOrderId.get(o.id))])
    );
    const allAllocations: Array<{ statement: BankStatementEntry; order: Order; amount: number }> = [];
    const perStatementLinks = new Map<string, Array<{ orderId: string; amount: number }>>();

    sts.forEach(st => {
      let remSt = st.valorBruto;
      const stLinks: Array<{ orderId: string; amount: number }> = [];
      ords.forEach(ord => {
        if (remSt <= 0.005) return;
        const owed = remainingByOrder.get(ord.id) || 0;
        if (owed <= 0.005) return;
        const alloc = Number(Math.min(owed, remSt).toFixed(2));
        if (alloc > 0) {
          remainingByOrder.set(ord.id, Number((owed - alloc).toFixed(2)));
          remSt = Number((remSt - alloc).toFixed(2));
          allAllocations.push({ statement: st, order: ord, amount: alloc });
          stLinks.push({ orderId: ord.id, amount: alloc });
        }
      });
      if (stLinks.length > 0) perStatementLinks.set(st.id, stLinks);
    });

    if (allAllocations.length === 0) {
      notify('Os pedidos selecionados já estão com saldo zerado.');
      return;
    }

    setBusyAction(true);
    try {
      const conciliatedIds = Array.from(perStatementLinks.keys());
      if (SupabaseService.isConfigured()) {
        await SupabaseService.confirmStatementReconciliation({
          statementIds: conciliatedIds,
          links: allAllocations.map(a => ({
            statementId: a.statement.id,
            orderId: a.order.id,
            amount: a.amount,
          })),
          operatorName: operatorLabel,
        });
      }

      await applyReconciliationToOrders(allAllocations);

      const nowIso = new Date().toISOString();
      setStatements(prev =>
        prev.map(s => {
          const allocs = perStatementLinks.get(s.id);
          if (!allocs) return s;
          return {
            ...s,
            status: 'CONCILIADO',
            conciliadoPor: operatorLabel,
            conciliadoEm: nowIso,
            allocations: allocs,
            linkedOrderIds: allocs.map(a => a.orderId),
          };
        })
      );
      setSelectedStatementIds(new Set());
      setSelectedOrderIds(new Set());
      notify(
        `${conciliatedIds.length} extrato(s) conciliado(s) com ${ords.length} pedido(s) e Financeiro atualizado!`
      );
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar a conciliação.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleAutoMatchAll = async () => {
    if (isPeriodLocked || busyAction) return;
    const candidates = compStatements.filter(
      s =>
        (s.status === 'PENDENTE' || s.status === 'PARCIAL') &&
        suggestionsMap.get(s.id)?.confidence === 'EXATO'
    );
    if (candidates.length === 0) return;

    const usedOrderIds = new Set<string>();
    const allocations: Array<{ statement: BankStatementEntry; order: Order; amount: number }> = [];
    const perStatementLinks = new Map<string, Array<{ orderId: string; amount: number }>>();

    candidates.forEach(st => {
      const sug = suggestionsMap.get(st.id);
      const oid = sug?.matchedOrderIds[0];
      if (!oid || usedOrderIds.has(oid)) return;
      const ord = kpiStats.openOrders.find(o => o.id === oid);
      if (!ord) return;
      const owed = getOrderOpenBalance(ord, recordByOrderId.get(ord.id));
      const alloc = Number(Math.min(owed, st.valorBruto).toFixed(2));
      if (alloc <= 0) return;
      usedOrderIds.add(oid);
      allocations.push({ statement: st, order: ord, amount: alloc });
      perStatementLinks.set(st.id, [{ orderId: ord.id, amount: alloc }]);
    });

    if (allocations.length === 0) return;

    setBusyAction(true);
    try {
      const ids = Array.from(perStatementLinks.keys());
      if (SupabaseService.isConfigured()) {
        await SupabaseService.confirmStatementReconciliation({
          statementIds: ids,
          links: allocations.map(a => ({
            statementId: a.statement.id,
            orderId: a.order.id,
            amount: a.amount,
          })),
          operatorName: operatorLabel,
        });
      }

      await applyReconciliationToOrders(allocations);

      const nowIso = new Date().toISOString();
      setStatements(prev =>
        prev.map(s => {
          const allocs = perStatementLinks.get(s.id);
          if (!allocs) return s;
          return {
            ...s,
            status: 'CONCILIADO',
            conciliadoPor: operatorLabel,
            conciliadoEm: nowIso,
            allocations: allocs,
            linkedOrderIds: allocs.map(a => a.orderId),
          };
        })
      );
      setSelectedStatementIds(new Set());
      setSelectedOrderIds(new Set());
      notify(`${ids.length} lançamento(s) conciliado(s) automaticamente!`);
    } catch (err: any) {
      alert(err?.message || 'Erro ao executar Conciliar Automáticos.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleConfirmIgnore = async () => {
    if (isPeriodLocked || busyAction || selectedStatementIds.size === 0) return;
    const ids = Array.from(selectedStatementIds);
    const reason = ignoreReason.trim() || 'Não operacional';
    setBusyAction(true);
    try {
      if (SupabaseService.isConfigured()) {
        await SupabaseService.ignoreStatementEntries(ids, reason, operatorLabel);
      }
      const nowIso = new Date().toISOString();
      setStatements(prev =>
        prev.map(s =>
          ids.includes(s.id)
            ? {
                ...s,
                status: 'IGNORADO',
                motivoIgnorado: reason,
                ignoradoPor: operatorLabel,
                ignoradoEm: nowIso,
              }
            : s
        )
      );
      setSelectedStatementIds(new Set());
      setSelectedOrderIds(new Set());
      setIsIgnoreModalOpen(false);
      notify(`${ids.length} lançamento(s) marcado(s) como Ignorado.`);
    } catch (err: any) {
      alert(err?.message || 'Erro ao marcar lançamentos como Ignorados.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleRevertStatement = async (st: BankStatementEntry) => {
    if (isPeriodLocked || busyAction) return;

    const linkedOrders = orders.filter(o => st.linkedOrderIds.includes(o.id));
    if (
      st.status === 'CONCILIADO' &&
      linkedOrders.some(o => getEffectiveInvoiceStatus(recordByOrderId.get(o.id)) === 'EMITIDA')
    ) {
      alert(
        'Não é possível desfazer enquanto houver Nota Fiscal Emitida em pedido vinculado. Volte a NF para "A emitir" primeiro.'
      );
      return;
    }

    setBusyAction(true);
    try {
      if (st.status === 'CONCILIADO') {
        for (const ord of linkedOrders) {
          const rec = recordByOrderId.get(ord.id);
          if (!rec) continue;
          const remainingEntries = (rec.lancamentos || []).filter(
            ent => ent.id !== `ext-${st.id}` && ent.referenciaExtrato !== st.id
          );
          const derived = deriveReconciliationState(
            ord,
            remainingEntries,
            financialChannels,
            false
          );
          const primary = remainingEntries[0];
          const nextRecord: OrderFinancialRecord = {
            ...rec,
            conciliacaoStatus: derived.conciliacaoStatus,
            meioPagamentoId: primary?.meioPagamentoId,
            meioPagamentoNome: primary?.meioPagamentoNome,
            dataPagamento: primary?.dataPagamento,
            dataExtrato: primary?.dataExtrato,
            valorConciliado: derived.valorConciliado,
            lancamentos: remainingEntries,
            referenciaExtrato: primary?.referenciaExtrato,
            atualizadoPor: operatorLabel,
          };
          const totalPaid = Number(
            remainingEntries.reduce((sum, ent) => sum + (Number(ent.valor) || 0), 0).toFixed(2)
          );
          await onSaveFinancialRecord(nextRecord, {
            statusPagamento:
              totalPaid >= ord.valorTotal - 0.009
                ? 'PAGO'
                : totalPaid > 0
                ? 'SINAL'
                : 'PENDENTE',
            valorPago: Math.min(ord.valorTotal, totalPaid),
          });
        }
      }

      if (SupabaseService.isConfigured()) {
        await SupabaseService.revertStatementEntry(st.id);
      }

      setStatements(prev =>
        prev.map(s =>
          s.id === st.id
            ? {
                ...s,
                status: 'PENDENTE',
                linkedOrderIds: [],
                allocations: [],
                conciliadoPor: undefined,
                conciliadoEm: undefined,
                ignoradoPor: undefined,
                ignoradoEm: undefined,
                motivoIgnorado: undefined,
              }
            : s
        )
      );
      setSubTab('PENDENTE');
      notify('Lançamento retornado para A Conciliar.');
    } catch (err: any) {
      alert(err?.message || 'Erro ao desfazer/restaurar lançamento.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleConfirmImport = async (
    batch: Omit<StatementImportBatch, 'id' | 'createdAt'>,
    newRows: Array<ParsedStatementRow & { canalId?: string; canalNome: string }>
  ) => {
    if (SupabaseService.isConfigured()) {
      const { insertedEntries, duplicateCount } =
        await SupabaseService.saveStatementBatchWithEntries(batch, newRows);
      setStatements(prev => [...insertedEntries, ...prev]);
      if (insertedEntries[0]?.competencia) {
        setCompetencia(insertedEntries[0].competencia);
      }
      notify(
        `Importação concluída: ${insertedEntries.length} novo(s)${
          duplicateCount > 0 ? `, ${duplicateCount} duplicado(s) ignorado(s)` : ''
        }!`
      );
    } else {
      const offlineRows: BankStatementEntry[] = newRows.map((r, i) => ({
        id: `st-local-${Date.now()}-${i}`,
        competencia: r.competencia,
        canalId: r.canalId,
        canalNome: r.canalNome,
        dataExtrato: r.dataExtrato,
        descricao: r.descricao,
        pagadorNome: r.pagadorNome,
        referenciaNsu: r.referenciaNsu,
        valorBruto: r.valorBruto,
        valorTaxa: r.valorTaxa,
        valorLiquido: r.valorLiquido,
        status: 'PENDENTE',
        fingerprintHash: r.fingerprintHash,
        linkedOrderIds: [],
        allocations: [],
      }));
      setStatements(prev => [...offlineRows, ...prev]);
      if (offlineRows[0]?.competencia) setCompetencia(offlineRows[0].competencia);
      notify(`${offlineRows.length} crédito(s) importado(s) na sessão local.`);
    }
    setSubTab('PENDENTE');
  };

  const handleLockPeriod = async () => {
    setBusyAction(true);
    try {
      const snapshot = {
        totalBruto: kpiStats.totalBruto,
        conciliado: kpiStats.totalConc,
        pendente: kpiStats.totalPend,
        conciliadosCount: kpiStats.concCount,
        pendentesCount: kpiStats.pendCount,
      };
      const saved = await SupabaseService.lockReconciliationPeriod(
        competencia,
        operatorLabel,
        snapshot
      );
      setPeriodLocks(prev => {
        const rest = prev.filter(p => p.competencia !== competencia);
        return [saved, ...rest];
      });
      setIsLockModalOpen(false);
      setSelectedStatementIds(new Set());
      setSelectedOrderIds(new Set());
      notify(`Competência ${formatCompetenciaLabel(competencia)} fechada e travada!`);
    } catch (err: any) {
      alert(err?.message || 'Não foi possível fechar o período.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleUnlockPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userProfile.role !== 'ADMIN') {
      setUnlockError('Somente usuários ADMIN podem reabrir um período fechado.');
      return;
    }
    const pin = unlockPin.trim();
    if (!/^\d{8}$/.test(pin)) {
      setUnlockError('Informe um PIN numérico de 8 dígitos.');
      return;
    }
    setVerifyingUnlock(true);
    setUnlockError(null);
    try {
      const valid = onVerifyPin ? await onVerifyPin(pin) : false;
      if (!valid) {
        setUnlockError('PIN ADMIN incorreto.');
        return;
      }
      const reopened = await SupabaseService.unlockReconciliationPeriod(
        competencia,
        operatorLabel
      );
      setPeriodLocks(prev => {
        const rest = prev.filter(p => p.competencia !== competencia);
        return [reopened, ...rest];
      });
      setIsUnlockModalOpen(false);
      setUnlockPin('');
      notify(`Competência ${formatCompetenciaLabel(competencia)} reaberta via ADMIN.`);
    } catch (err: any) {
      setUnlockError(err?.message || 'Erro ao validar PIN ADMIN.');
    } finally {
      setVerifyingUnlock(false);
    }
  };

  const footerSummary = useMemo(() => {
    const sts = compStatements.filter(
      s => (s.status === 'PENDENTE' || s.status === 'PARCIAL') && selectedStatementIds.has(s.id)
    );
    const ords = kpiStats.openOrders.filter(o => selectedOrderIds.has(o.id));
    const sumSt = Number(sts.reduce((a, s) => a + s.valorBruto, 0).toFixed(2));
    const sumOrd = Number(
      ords.reduce((a, o) => a + getOrderOpenBalance(o, recordByOrderId.get(o.id)), 0).toFixed(2)
    );
    const sumFee = Number(sts.reduce((a, s) => a + s.valorTaxa, 0).toFixed(2));
    const diff = Number((sumSt - sumOrd).toFixed(2));
    return { stsCount: sts.length, ordsCount: ords.length, sumSt, sumOrd, sumFee, diff };
  }, [compStatements, selectedStatementIds, kpiStats.openOrders, selectedOrderIds, recordByOrderId]);

  const channelOptions = useMemo(() => {
    const names = new Set<string>(['PixC6', 'C6pay', 'Sumup', 'Rede']);
    financialChannels.filter(c => c.ativo).forEach(c => names.add(c.nome));
    compStatements.forEach(s => names.add(s.canalNome));
    return Array.from(names);
  }, [financialChannels, compStatements]);

  const tabLabel =
    subTab === 'PENDENTE' ? 'A Conciliar' : subTab === 'CONCILIADO' ? 'Conciliados' : 'Ignorados';

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden bg-[#f8f9ff]">
      {/* Header Controls Row */}
      <div className="shrink-0 min-w-0 flex flex-col md:flex-row md:flex-wrap md:items-center justify-between md:bg-white md:border-b md:border-[#e2e8f0] md:px-4 lg:px-5 md:py-2.5 md:gap-2 print:hidden">
        <div className="bg-white border-b border-[#e2e8f0] px-3 py-2.5 md:p-0 md:bg-transparent md:border-b-0 min-w-0">
          <h1 className="text-xl font-bold text-[#0f172a] font-sans flex flex-wrap items-center gap-2 min-w-0">
            <span>Financeiro</span>
            <span
              className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 max-w-full truncate"
              title={`${filteredStatements.length} lançamento(s) • ${tabLabel}`}
            >
              {filteredStatements.length} lançamento(s) • {tabLabel}
            </span>
          </h1>
        </div>

        <div className="bg-white border-b border-[#e2e8f0] px-3 py-2 md:p-0 md:bg-transparent md:border-b-0 flex flex-wrap items-center gap-1.5 min-w-0 shrink-0">
          {moduleTabs}
          <button
            type="button"
            onClick={() => setIsReportModalOpen(true)}
            title="Exportar relatório de conciliação (PDF / Excel)"
            aria-label="Exportar relatório de conciliação (PDF / Excel)"
            className="inline-flex items-center justify-center h-8 w-8 p-0 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs cursor-pointer transition-colors"
          >
            <FileText className="w-4 h-4 text-slate-600 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (isPeriodLocked) {
                if (userProfile.role !== 'ADMIN') {
                  alert('Somente usuários ADMIN podem reabrir uma competência fechada.');
                  return;
                }
                setUnlockPin('');
                setUnlockError(null);
                setIsUnlockModalOpen(true);
              } else {
                setIsLockModalOpen(true);
              }
            }}
            title={isPeriodLocked ? 'Reabrir Período (ADMIN PIN)' : 'Fechar Período Mensal'}
            aria-label={isPeriodLocked ? 'Reabrir Período (ADMIN PIN)' : 'Fechar Período Mensal'}
            className={`inline-flex items-center justify-center h-8 w-8 p-0 rounded-lg border shadow-2xs cursor-pointer transition-colors ${
              isPeriodLocked
                ? 'border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800'
                : 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900'
            }`}
          >
            {isPeriodLocked ? (
              <LockOpen className="w-4 h-4 shrink-0" />
            ) : (
              <Lock className="w-4 h-4 shrink-0" />
            )}
          </button>

          <button
            type="button"
            disabled={isPeriodLocked || busyAction || kpiStats.exactCount === 0}
            onClick={() => void handleAutoMatchAll()}
            title={`Conciliar automaticamente lançamentos com match exato (${kpiStats.exactCount})`}
            aria-label={`Conciliar automaticamente lançamentos com match exato (${kpiStats.exactCount})`}
            className="inline-flex items-center justify-center h-8 w-8 p-0 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white shadow-2xs cursor-pointer transition-colors"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          </button>

          <button
            type="button"
            disabled={isPeriodLocked || busyAction}
            onClick={() => setIsImportModalOpen(true)}
            title="Importar extrato OFX, CSV ou XLSX"
            aria-label="Importar extrato OFX, CSV ou XLSX"
            className="inline-flex items-center justify-center h-8 w-8 p-0 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-45 text-white shadow-2xs cursor-pointer transition-colors"
          >
            <Upload className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>

      {/* Unified Controls (Sub-tabs + Period + Channel) */}
      <div className="px-3 sm:px-5 py-2 bg-[#f8f9ff] border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0 min-w-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {/* Sub-tabs (far left) */}
          <div className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-[11px] font-semibold shrink-0 max-w-full overflow-x-auto">
            {(
              [
                { id: 'PENDENTE', label: `A Conciliar (${kpiStats.pendCount})` },
                { id: 'CONCILIADO', label: `Conciliados (${kpiStats.concCount})` },
                { id: 'IGNORADO', label: `Ignorados (${kpiStats.ignCount})` },
              ] as const
            ).map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`h-full px-2.5 rounded-md whitespace-nowrap cursor-pointer transition-colors ${
                  subTab === t.id
                    ? 'bg-slate-900 text-white font-bold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Monthly Competence + Lock Status */}
          <div className="inline-flex items-center h-8 rounded-lg border border-slate-300 bg-white divide-x divide-slate-200 overflow-hidden shrink-0">
            <div className="relative flex items-center px-2 h-full">
              <select
                aria-label="Selecionar competência mensal"
                value={competencia}
                onChange={e => {
                  setCompetencia(e.target.value);
                  setSelectedStatementIds(new Set());
                  setSelectedOrderIds(new Set());
                }}
                className="appearance-none bg-transparent pr-5 outline-none cursor-pointer text-xs font-bold text-slate-800"
              >
                {availableCompetencias.map(comp => (
                  <option key={comp} value={comp}>
                    {formatCompetenciaLabel(comp)}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-1.5 pointer-events-none" />
            </div>
            <span
              className={`px-2 h-full flex items-center text-[10px] font-bold whitespace-nowrap ${
                isPeriodLocked ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
              }`}
              title={
                isPeriodLocked && activePeriodLock?.fechadoPor
                  ? `Fechado por ${activePeriodLock.fechadoPor}`
                  : 'Competência aberta para conciliação'
              }
            >
              {isPeriodLocked ? 'Fechado 🔒' : 'Aberto'}
            </span>
          </div>
        </div>

        {/* Channel Filter + Reset */}
        <div className="inline-flex items-center h-8 rounded-lg border border-slate-300 bg-white divide-x divide-slate-200 text-[11px] font-semibold overflow-hidden shrink-0">
          <div className="relative flex items-center px-2 h-full">
            <select
              aria-label="Filtrar por canal"
              value={channelFilter}
              onChange={e => setChannelFilter(e.target.value)}
              className="appearance-none bg-transparent pr-5 outline-none cursor-pointer text-[11px] font-semibold text-slate-800"
            >
              <option value="TODOS">Canal: Todos</option>
              {channelOptions.map(name => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-1.5 pointer-events-none" />
          </div>
          <button
            type="button"
            title="Limpar filtros"
            aria-label="Limpar filtros"
            onClick={() => {
              setChannelFilter('TODOS');
              setSearchStatements('');
              setSearchOrders('');
            }}
            className="h-full px-2 flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Locked Period Banner */}
      {isPeriodLocked && (
        <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 flex flex-wrap items-center justify-between gap-2 text-xs text-rose-900 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Lock className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="truncate">
              Competência <strong>{formatCompetenciaLabel(competencia)}</strong> fechada por{' '}
              <strong>{activePeriodLock?.fechadoPor || 'ADMIN'}</strong>
              {activePeriodLock?.fechadoEm
                ? ` em ${new Date(activePeriodLock.fechadoEm).toLocaleString('pt-BR')}`
                : ''}
              . Conciliações, Nota Fiscal e Desfazer estão travados.
            </span>
          </div>
          {userProfile.role === 'ADMIN' && (
            <button
              type="button"
              onClick={() => {
                setUnlockPin('');
                setUnlockError(null);
                setIsUnlockModalOpen(true);
              }}
              className="px-2.5 py-1 rounded-md border border-rose-300 bg-white hover:bg-rose-100 text-rose-800 font-bold text-[11px] cursor-pointer shrink-0"
            >
              Reabrir com PIN ADMIN
            </button>
          )}
        </div>
      )}

      {/* Main Tab Body */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden bg-white">
        {subTab === 'PENDENTE' && (
          <>
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 overflow-hidden">
              {/* Left Column: Extratos */}
              <div className="flex flex-col min-h-0 min-w-0">
                <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
                      Extratos
                    </span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      {filteredStatements.length} crédito(s)
                    </span>
                  </div>
                  <div className="relative w-full sm:w-56">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchStatements}
                      onChange={e => setSearchStatements(e.target.value)}
                      placeholder="Buscar pagador, descrição ou valor..."
                      className="w-full h-7 pl-8 pr-2.5 rounded-md border border-slate-300 bg-white text-[11px] outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                  {loadingData ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      Carregando extratos...
                    </div>
                  ) : filteredStatements.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      Nenhum extrato pendente nesta competência/filtro. Clique em <strong>Importar Extrato</strong> acima para carregar um arquivo OFX, CSV ou XLSX.
                    </div>
                  ) : (
                    filteredStatements.map(st => {
                      const isChecked = selectedStatementIds.has(st.id);
                      const sug = suggestionsMap.get(st.id);
                      const conf = sug?.confidence || 'SEM_MATCH';
                      return (
                        <label
                          key={st.id}
                          title={`Cód. Transação: ${st.referenciaNsu || '—'}`}
                          className={`px-3.5 py-2.5 flex items-center justify-between gap-2.5 transition-colors ${
                            isPeriodLocked ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                          } ${
                            isChecked
                              ? 'bg-blue-50/85 border-l-4 border-l-blue-600'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isPeriodLocked}
                              onChange={e => toggleStatementCheck(st.id, e.target.checked)}
                              className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-[10.5px] text-slate-500">
                                  {formatDateBR(st.dataExtrato)}
                                </span>
                                <span
                                  className={`px-1.5 py-0.2 rounded border text-[10px] font-bold ${channelBadgeClass(
                                    st.canalNome
                                  )}`}
                                >
                                  {st.canalNome}
                                </span>
                                {conf === 'EXATO' ? (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                    Match {sug?.score}%
                                  </span>
                                ) : conf === 'PROVAVEL' ? (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                                    {st.valorTaxa > 0
                                      ? `Taxa R$ ${formatCurrencyBR(st.valorTaxa)}`
                                      : `Sugestão ${sug?.score}%`}
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-semibold">
                                    Manual
                                  </span>
                                )}
                              </div>
                              <div className="text-xs font-bold text-slate-900 truncate mt-0.5">
                                {st.pagadorNome}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {st.descricao}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs sm:text-sm font-mono font-bold text-slate-900 tabular-nums">
                              R$ {formatCurrencyBR(st.valorBruto)}
                            </span>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: Pedidos */}
              <div className="flex flex-col min-h-0 min-w-0 bg-slate-50/40">
                <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-700">
                      Pedidos
                    </span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                      {filteredOpenOrders.length} em aberto
                    </span>
                  </div>
                  <div className="relative w-full sm:w-56">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchOrders}
                      onChange={e => setSearchOrders(e.target.value)}
                      placeholder="Buscar nº pedido, cliente..."
                      className="w-full h-7 pl-8 pr-2.5 rounded-md border border-slate-300 bg-white text-[11px] outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
                  {filteredOpenOrders.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      Nenhum pedido aguardando conciliação.
                    </div>
                  ) : (
                    filteredOpenOrders.map(ord => {
                      const rec = recordByOrderId.get(ord.id);
                      const owed = getOrderOpenBalance(ord, rec);
                      const alreadyConc = Math.max(0, Number(rec?.valorConciliado) || 0);
                      const isChecked = selectedOrderIds.has(ord.id);
                      const isSuggested = suggestedOrderIdsSet.has(ord.id);
                      return (
                        <label
                          key={ord.id}
                          className={`px-3.5 py-2.5 flex items-center justify-between gap-2.5 transition-colors ${
                            isPeriodLocked ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                          } ${
                            isChecked
                              ? 'bg-emerald-50/75 border-l-4 border-l-emerald-500'
                              : isSuggested
                              ? 'bg-emerald-50/35 hover:bg-emerald-50/60'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isPeriodLocked}
                              onChange={e => {
                                if (isPeriodLocked) return;
                                const next = new Set(selectedOrderIds);
                                if (e.target.checked) next.add(ord.id);
                                else next.delete(ord.id);
                                setSelectedOrderIds(next);
                              }}
                              className="mt-1 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-xs font-bold text-slate-900">
                                  {ord.numeroPedido}
                                </span>
                                <span className="text-[10px] font-mono text-slate-500">
                                  {formatDateBR(ord.dataPedido)}
                                </span>
                                <span className="px-1.5 py-0.2 rounded bg-slate-100 text-[10px] font-semibold text-slate-700">
                                  {ord.formaPagamento.toUpperCase()}
                                </span>
                                {ord.statusPagamento === 'SINAL' && (
                                  <span className="px-1.5 py-0.2 rounded bg-sky-50 text-sky-800 border border-sky-200 text-[10px] font-bold">
                                    SINAL
                                  </span>
                                )}
                                {isSuggested && (
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                                    Sugestão
                                  </span>
                                )}
                              </div>
                              <div className="text-xs font-semibold text-slate-800 truncate mt-0.5">
                                {ord.clienteNome}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs sm:text-sm font-mono font-bold text-slate-900 tabular-nums">
                              R$ {formatCurrencyBR(owed)}
                            </div>
                            {alreadyConc > 0 && (
                              <div className="text-[10px] font-mono text-emerald-700">
                                Já conc.: R$ {formatCurrencyBR(alreadyConc)}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Reconciliation Action Bar */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-2.5 shrink-0">
              {isPeriodLocked ? (
                <span className="text-xs font-semibold text-rose-700">
                  Período travado para alterações. Use o botão <strong>Relatório</strong> para exportar ou reabra com PIN ADMIN.
                </span>
              ) : footerSummary.stsCount === 0 ? (
                <span className="text-xs text-slate-500">
                  Marque 1 ou mais extratos à esquerda e 1 ou mais pedidos à direita para conciliar (<strong>1:1</strong>, <strong>1:N</strong> ou <strong>N:1</strong>).
                </span>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
                    <span className="font-semibold text-slate-700">
                      Extratos marcados ({footerSummary.stsCount}):{' '}
                      <strong className="font-mono text-slate-900">
                        R$ {formatCurrencyBR(footerSummary.sumSt)}
                      </strong>
                    </span>
                    <span className="text-slate-400">↔</span>
                    <span className="font-semibold text-slate-700">
                      Pedidos marcados ({footerSummary.ordsCount}):{' '}
                      <strong className="font-mono text-slate-900">
                        R$ {formatCurrencyBR(footerSummary.sumOrd)}
                      </strong>
                    </span>
                    {footerSummary.ordsCount === 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono text-[10.5px] font-semibold">
                        Marque 1+ pedido à direita
                      </span>
                    ) : Math.abs(footerSummary.diff) <= 0.02 ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono text-[10.5px] font-bold">
                        {footerSummary.sumFee > 0
                          ? `Bruto exato • Taxa MDR R$ ${formatCurrencyBR(footerSummary.sumFee)}`
                          : 'Bate exato ✓'}
                      </span>
                    ) : footerSummary.diff < 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200 font-mono text-[10.5px] font-bold">
                        Sinal / Parcial (restará R$ {formatCurrencyBR(Math.abs(footerSummary.diff))})
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-mono text-[10.5px] font-bold">
                        Diferença: +R$ {formatCurrencyBR(footerSummary.diff)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => {
                        setIgnoreReason('Estorno / Devolução');
                        setIsIgnoreModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
                    >
                      Ignorar{footerSummary.stsCount > 1 ? ` (${footerSummary.stsCount})` : ''}
                    </button>
                    <button
                      type="button"
                      disabled={busyAction || footerSummary.ordsCount === 0}
                      onClick={() => void handleConfirmManualReconcile()}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white text-xs font-bold shadow-2xs cursor-pointer transition-colors"
                    >
                      {busyAction ? 'Salvando...' : 'Conciliar'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {subTab === 'CONCILIADO' && (
          <div className="flex-1 min-h-0 overflow-auto max-w-full">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[10.5px] font-mono uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-2.5 px-3">Data Extrato</th>
                  <th className="py-2.5 px-3">Canal</th>
                  <th className="py-2.5 px-3">Extrato (Pagador)</th>
                  <th className="py-2.5 px-3 text-right">Bruto / MDR</th>
                  <th className="py-2.5 px-3">Pedido(s) Vinculado(s)</th>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3 text-center">Conciliado</th>
                  <th className="py-2.5 px-3 text-center">Nota Fiscal</th>
                  <th className="py-2.5 px-3">Auditoria</th>
                  <th className="py-2.5 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStatements.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-slate-400">
                      Nenhum lançamento conciliado nesta competência.
                    </td>
                  </tr>
                ) : (
                  filteredStatements.map(st => {
                    const linkedOrders = orders.filter(o => st.linkedOrderIds.includes(o.id));
                    const hasIssuedNf = linkedOrders.some(
                      o => getEffectiveInvoiceStatus(recordByOrderId.get(o.id)) === 'EMITIDA'
                    );
                    const revertDisabled = isPeriodLocked || busyAction || hasIssuedNf;
                    const revertTitle = isPeriodLocked
                      ? 'Período travado: reabra com PIN ADMIN'
                      : hasIssuedNf
                      ? 'Volte a Nota Fiscal para "A emitir" antes de desfazer'
                      : 'Desfazer conciliação';

                    return (
                      <tr
                        key={st.id}
                        className="hover:bg-slate-50/80"
                        title={`Cód. Transação: ${st.referenciaNsu || '—'}`}
                      >
                        <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap align-top">
                          {formatDateBR(st.dataExtrato)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap align-top">
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${channelBadgeClass(
                              st.canalNome
                            )}`}
                          >
                            {st.canalNome}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 align-top">
                          <div className="font-bold text-slate-900">{st.pagadorNome}</div>
                          <div className="text-[10.5px] text-slate-500">{st.descricao}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap align-top">
                          <div className="font-mono font-bold text-emerald-700">
                            R$ {formatCurrencyBR(st.valorBruto)}
                          </div>
                          {st.valorTaxa > 0 && (
                            <div className="text-[10px] font-mono text-amber-700">
                              MDR R$ {formatCurrencyBR(st.valorTaxa)}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 align-top">
                          {linkedOrders.length === 0 ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            linkedOrders.map(ord => (
                              <div
                                key={ord.id}
                                className="min-h-[34px] flex items-center font-mono font-bold text-slate-900 whitespace-nowrap"
                              >
                                {ord.numeroPedido}
                              </div>
                            ))
                          )}
                        </td>
                        <td className="py-2 px-3 align-top">
                          {linkedOrders.length === 0 ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            linkedOrders.map(ord => (
                              <div
                                key={ord.id}
                                className="min-h-[34px] flex items-center font-semibold text-slate-800"
                              >
                                {ord.clienteNome}
                              </div>
                            ))
                          )}
                        </td>
                        <td className="py-2 px-3 text-center align-top">
                          {linkedOrders.length === 0 ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            linkedOrders.map(ord => {
                              const rec = recordByOrderId.get(ord.id);
                              const isConc = getEffectiveReconciliationStatus(ord, rec) === 'CONCILIADO';
                              const metrics = getOrderRowMetrics(ord, rec);
                              const nfStatus = getEffectiveInvoiceStatus(rec);
                              const isLockedByNf = nfStatus === 'EMITIDA';
                              const isBonificado = Boolean(metrics.draftTotals?.hasBonificado);
                              const hasValidEntryDate =
                                isBonificado ||
                                metrics.entries.some(e => Boolean((e.dataExtrato || e.dataPagamento || '').trim()));
                              const canCheck =
                                !isPeriodLocked &&
                                (isBonificado || (metrics.saldoDevedor <= 0.009 && hasValidEntryDate));

                              return (
                                <div
                                  key={ord.id}
                                  className="min-h-[34px] flex items-center justify-center"
                                >
                                  {renderConciliationToggle(
                                    ord,
                                    rec,
                                    isConc,
                                    busyAction || isPeriodLocked,
                                    canCheck,
                                    isLockedByNf || isPeriodLocked
                                  )}
                                </div>
                              );
                            })
                          )}
                        </td>
                        <td className="py-2 px-3 text-center align-top">
                          {linkedOrders.length === 0 ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            linkedOrders.map(ord => {
                              const rec = recordByOrderId.get(ord.id);
                              const isConc = getEffectiveReconciliationStatus(ord, rec) === 'CONCILIADO';
                              const metrics = getOrderRowMetrics(ord, rec);
                              const nfStatus = getEffectiveInvoiceStatus(rec);
                              const canToggleNf =
                                !isPeriodLocked && isConc && metrics.saldoDevedor <= 0.009;

                              return (
                                <div
                                  key={ord.id}
                                  className="min-h-[34px] flex items-center justify-center"
                                >
                                  {renderInvoiceToggle(
                                    ord,
                                    rec,
                                    nfStatus,
                                    busyAction || isPeriodLocked,
                                    canToggleNf
                                  )}
                                </div>
                              );
                            })
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap align-top">
                          {st.conciliadoPor ? (
                            <div>
                              <div className="font-semibold text-slate-700">{st.conciliadoPor}</div>
                              {st.conciliadoEm && (
                                <div className="text-[10px] font-mono text-slate-400">
                                  {new Date(st.conciliadoEm).toLocaleString('pt-BR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </div>
                              )}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap align-top">
                          <button
                            type="button"
                            disabled={revertDisabled}
                            title={revertTitle}
                            onClick={() => void handleRevertStatement(st)}
                            className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold text-slate-700 cursor-pointer transition-colors"
                          >
                            Desfazer
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {subTab === 'IGNORADO' && (
          <div className="flex-1 min-h-0 overflow-auto max-w-full">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[10.5px] font-mono uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-2.5 px-3">Data</th>
                  <th className="py-2.5 px-3">Canal</th>
                  <th className="py-2.5 px-3">Descrição / Pagador</th>
                  <th className="py-2.5 px-3">Cód. Transação</th>
                  <th className="py-2.5 px-3">Motivo / Auditoria</th>
                  <th className="py-2.5 px-3 text-right">Valor</th>
                  <th className="py-2.5 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStatements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      Nenhum lançamento ignorado nesta competência.
                    </td>
                  </tr>
                ) : (
                  filteredStatements.map(st => (
                    <tr key={st.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {formatDateBR(st.dataExtrato)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${channelBadgeClass(
                            st.canalNome
                          )}`}
                        >
                          {st.canalNome}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{st.pagadorNome}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">{st.referenciaNsu || '—'}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800">
                          {st.motivoIgnorado || '—'}
                        </div>
                        {st.ignoradoPor && (
                          <div className="text-[10px] font-mono text-slate-400">
                            {st.ignoradoPor}
                            {st.ignoradoEm
                              ? ` • ${new Date(st.ignoradoEm).toLocaleString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}`
                              : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                        R$ {formatCurrencyBR(st.valorBruto)}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={isPeriodLocked || busyAction}
                          title={isPeriodLocked ? 'Período travado' : 'Restaurar para A Conciliar'}
                          onClick={() => void handleRevertStatement(st)}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold text-slate-700 cursor-pointer transition-colors"
                        >
                          Restaurar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ignore Reason Modal */}
      {isIgnoreModalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[70] flex items-center justify-center p-4"
          onClick={() => setIsIgnoreModalOpen(false)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl shadow-xl max-w-md w-full overflow-hidden text-xs"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                Registrar Motivo — Ignorar Lançamento
              </h2>
              <button
                type="button"
                onClick={() => setIsIgnoreModalOpen(false)}
                aria-label="Fechar"
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-slate-600">
                Este motivo ficará gravado na auditoria da aba <strong>Ignorados</strong>.
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  'Estorno / Devolução',
                  'Transferência entre contas',
                  'Tarifa / Ajuste bancário',
                  'Crédito não operacional',
                ].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setIgnoreReason(preset)}
                    className={`px-2.5 py-2 rounded-lg border text-left font-semibold cursor-pointer ${
                      ignoreReason === preset
                        ? 'border-rose-400 bg-rose-50 text-rose-800'
                        : 'border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={ignoreReason}
                onChange={e => setIgnoreReason(e.target.value)}
                placeholder="Ou descreva o motivo..."
                className="w-full h-9 px-3 rounded-lg border border-slate-300 outline-none focus:border-blue-500"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsIgnoreModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={() => void handleConfirmIgnore()}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                >
                  Confirmar Ignorar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lock Period Modal */}
      {isLockModalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[70] flex items-center justify-center p-4"
          onClick={() => setIsLockModalOpen(false)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl shadow-xl max-w-md w-full overflow-hidden text-xs"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Fechar Período Mensal</h2>
              <button
                type="button"
                onClick={() => setIsLockModalOpen(false)}
                aria-label="Fechar"
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-slate-700">
                Ao fechar a competência <strong>{formatCompetenciaLabel(competencia)}</strong>, conciliações, alterações de NF e o botão Desfazer ficam protegidos contra alterações acidentais.
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="text-[10px] text-emerald-700 font-bold">Conciliados</div>
                  <div className="font-mono font-bold text-emerald-900">{kpiStats.concCount}</div>
                </div>
                <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="text-[10px] text-amber-700 font-bold">Pendentes</div>
                  <div className="font-mono font-bold text-amber-900">{kpiStats.pendCount}</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] text-slate-600 font-bold">Bruto Mês</div>
                  <div className="font-mono font-bold text-slate-900">
                    R$ {formatCurrencyBR(kpiStats.totalBruto)}
                  </div>
                </div>
              </div>
              {kpiStats.pendCount > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900">
                  Atenção: ainda há <strong>{kpiStats.pendCount} lançamento(s) pendente(s)</strong> nesta competência. Um usuário ADMIN poderá reabrir com PIN se necessário.
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsLockModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={() => void handleLockPeriod()}
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
                >
                  Confirmar Fechamento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unlock Period Modal (ADMIN PIN via verificar_pin_operador) */}
      {isUnlockModalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[70] flex items-center justify-center p-4"
          onClick={() => setIsUnlockModalOpen(false)}
        >
          <form
            onSubmit={e => void handleUnlockPeriod(e)}
            className="bg-white border border-slate-200 rounded-2xl shadow-xl max-w-md w-full overflow-hidden text-xs"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-rose-200 bg-rose-50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-rose-900">Reabrir Período Fechado (ADMIN)</h2>
              <button
                type="button"
                onClick={() => setIsUnlockModalOpen(false)}
                aria-label="Fechar"
                className="p-1 text-rose-600 hover:text-rose-900 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-slate-700">
                Confirme seu PIN de <strong>ADMIN</strong> para reabrir a competência{' '}
                <strong>{formatCompetenciaLabel(competencia)}</strong>.
              </p>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  PIN ADMIN (8 dígitos numéricos)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  autoFocus
                  value={unlockPin}
                  onChange={e => setUnlockPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="••••••••"
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 font-mono tracking-widest outline-none focus:border-rose-500"
                />
                {unlockError && (
                  <div className="text-[11px] text-rose-600 font-semibold mt-1">{unlockError}</div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsUnlockModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={verifyingUnlock}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                >
                  {verifyingUnlock ? 'Validando...' : 'Validar PIN e Reabrir'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <ImportarExtratoModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        channels={financialChannels}
        existingFingerprints={existingFingerprints}
        operatorName={operatorLabel}
        onConfirmImport={handleConfirmImport}
      />

      <ConciliacaoReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        competencia={competencia}
        statements={statements}
        orders={orders}
        financialRecords={financialRecords}
        periodLock={activePeriodLock}
        channelNames={channelOptions}
      />

      {toastMsg && (
        <div className="fixed bottom-5 right-5 left-4 sm:left-auto z-[75] px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-lg text-center sm:text-left">
          {toastMsg}
        </div>
      )}
    </div>
  );
};
