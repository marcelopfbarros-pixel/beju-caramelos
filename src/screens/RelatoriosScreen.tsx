import React, { useState, useMemo } from 'react';
import {
  Order,
  Product,
  StoreUnit,
  StockItem,
  StockMovement,
  ProductionOrder,
  Customer
} from '../types';
import {
  BarChart3,
  Truck,
  ChefHat,
  Package,
  Boxes,
  ArrowLeftRight,
  Calendar,
  Users,
  DollarSign,
  Download,
  Printer,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PrintReportHeader } from '../components/PrintReportHeader';
import { useExpandedGroups } from '../hooks/useExpandedGroups';

type ReportTab =
  | 'planejamento_entrega'
  | 'planejamento_producao'
  | 'producao_produto'
  | 'contagem_estoque'
  | 'movimentacao_estoque'
  | 'pedidos_periodo'
  | 'pedidos_cliente'
  | 'faturamento_loja';

const GROUP_OPTIONS: Record<ReportTab, { value: string; label: string }[]> = {
  planejamento_entrega: [
    { value: 'LOJA', label: 'Por Loja' },
    { value: 'MODALIDADE', label: 'Por Modalidade' },
    { value: 'STATUS', label: 'Por Status' },
    { value: 'NENHUM', label: 'Sem agrupamento' }
  ],
  planejamento_producao: [
    { value: 'TURNO', label: 'Por Turno' },
    { value: 'DESTINO', label: 'Por Loja / Destino' },
    { value: 'STATUS', label: 'Por Status' },
    { value: 'NENHUM', label: 'Sem agrupamento' }
  ],
  producao_produto: [
    { value: 'UNIDADE', label: 'Por Unidade de Medida' },
    { value: 'NENHUM', label: 'Sem agrupamento' }
  ],
  contagem_estoque: [
    { value: 'LOJA', label: 'Por Loja' },
    { value: 'SITUACAO', label: 'Por Situação (Crítico / OK)' },
    { value: 'NENHUM', label: 'Sem agrupamento' }
  ],
  movimentacao_estoque: [
    { value: 'TIPO', label: 'Por Tipo' },
    { value: 'LOJA', label: 'Por Loja' },
    { value: 'DIA', label: 'Por Dia' },
    { value: 'NENHUM', label: 'Sem agrupamento' }
  ],
  pedidos_periodo: [
    { value: 'DIA', label: 'Por Dia' },
    { value: 'LOJA', label: 'Por Loja' },
    { value: 'PAGAMENTO', label: 'Por Pagamento' },
    { value: 'STATUS', label: 'Por Status' },
    { value: 'NENHUM', label: 'Sem agrupamento' }
  ],
  pedidos_cliente: [
    { value: 'PENDENCIA', label: 'Por Pendência' },
    { value: 'NENHUM', label: 'Sem agrupamento' }
  ],
  faturamento_loja: [
    { value: 'LOJA', label: 'Por Loja' },
    { value: 'PAGAMENTO', label: 'Por Forma de Pagamento' }
  ]
};

const SHIFT_ORDER: Record<string, number> = { MANHA: 1, TARDE: 2, NOITE: 3 };

function groupItems<T>(
  items: T[],
  enabled: boolean,
  keyFn: (item: T) => string,
  sortGroupsFn?: (a: string, b: string) => number
): { label: string; items: T[] }[] {
  if (!enabled) return [{ label: '', items }];
  const map = new Map<string, T[]>();
  items.forEach(item => {
    const key = keyFn(item) || 'Outros';
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  });
  const entries = Array.from(map.entries());
  entries.sort(([a], [b]) => (sortGroupsFn ? sortGroupsFn(a, b) : a.localeCompare(b, 'pt-BR')));
  return entries.map(([label, list]) => ({ label, items: list }));
}

interface RelatoriosScreenProps {
  orders: Order[];
  products: Product[];
  units: StoreUnit[];
  stock: StockItem[];
  stockMovements: StockMovement[];
  productionOrders: ProductionOrder[];
  customers: Customer[];
}

export const RelatoriosScreen: React.FC<RelatoriosScreenProps> = ({
  orders,
  products,
  units,
  stock,
  stockMovements,
  productionOrders,
  customers
}) => {
  const [activeReport, setActiveReport] = useState<ReportTab>('planejamento_entrega');
  const [groupBy, setGroupBy] = useState<string>(GROUP_OPTIONS.planejamento_entrega[0].value);
  const { isGroupExpanded, toggleGroup } = useExpandedGroups(`${activeReport}|${groupBy}`);

  const renderGroupBlock = <T,>(
    g: { label: string; items: T[] },
    colSpan: number,
    summaryText: string,
    renderRow: (item: T, idx: number) => React.ReactNode
  ) => {
    const expanded = isGroupExpanded(g.label || 'all', Boolean(g.label));
    return (
      <React.Fragment key={g.label || 'all'}>
        {g.label && (
          <tr
            onClick={() => toggleGroup(g.label)}
            className="bg-emerald-50 hover:bg-emerald-100/80 font-bold text-emerald-950 cursor-pointer transition-colors"
          >
            <td colSpan={colSpan} className="py-2 px-3">
              <span className="inline-flex items-center gap-1.5">
                {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <span>{summaryText}</span>
              </span>
            </td>
          </tr>
        )}
        {expanded && g.items.map(renderRow)}
      </React.Fragment>
    );
  };
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState<string>(thirtyDaysAgo);
  const [endDate, setEndDate] = useState<string>(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [selectedDay, setSelectedDay] = useState<string>(today);

  const prodMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const unitMap = useMemo(() => new Map(units.map(u => [u.id, u])), [units]);

  const tabs: { id: ReportTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'planejamento_entrega', label: 'Planejamento de Entrega', icon: Truck },
    { id: 'planejamento_producao', label: 'Planejamento de Produção', icon: ChefHat },
    { id: 'producao_produto', label: 'Produção por Produto', icon: Package },
    { id: 'contagem_estoque', label: 'Contagem de Estoque', icon: Boxes },
    { id: 'movimentacao_estoque', label: 'Movimentação de Estoque', icon: ArrowLeftRight },
    { id: 'pedidos_periodo', label: 'Pedidos por Período', icon: Calendar },
    { id: 'pedidos_cliente', label: 'Pedidos por Cliente', icon: Users },
    { id: 'faturamento_loja', label: 'Faturamento & Pagamentos', icon: DollarSign }
  ];

  // 1. Planejamento de Entrega por dia
  const deliveryPlanRows = useMemo(() => {
    return orders
      .filter(o => o.status !== 'CANCELADO' && o.dataHoraEntrega.slice(0, 10) === selectedDay)
      .sort((a, b) => a.dataHoraEntrega.localeCompare(b.dataHoraEntrega));
  }, [orders, selectedDay]);

  // 2. Planejamento de Produção por dia
  const productionPlanRows = useMemo(() => {
    const rows: {
      turno: string;
      sku: string;
      produto: string;
      quantidade: number;
      unidadeMedida: string;
      destino: string;
      status: string;
    }[] = [];

    orders
      .filter(o => o.status !== 'CANCELADO' && o.status !== 'ENTREGUE' && o.dataHoraEntrega.slice(0, 10) === selectedDay)
      .forEach(o => {
        const hour = new Date(o.dataHoraEntrega).getHours();
        const turno = hour < 12 ? 'MANHA' : hour < 18 ? 'TARDE' : 'NOITE';
        o.itens.forEach(it => {
          const p = prodMap.get(it.produtoId);
          if (!p) return;
          rows.push({
            turno,
            sku: p.sku,
            produto: p.descricao,
            quantidade: it.quantidade,
            unidadeMedida: p.unidade,
            destino: unitMap.get(o.unidadeOrigemId)?.nome || 'Loja',
            status: o.status
          });
        });
      });

    productionOrders
      .filter(po => po.dataProducao === selectedDay)
      .forEach(po => {
        po.itens.forEach(it => {
          const p = prodMap.get(it.produtoId);
          if (!p) return;
          rows.push({
            turno: po.turno,
            sku: p.sku,
            produto: p.descricao,
            quantidade: it.quantidadePlanejada,
            unidadeMedida: p.unidade,
            destino: unitMap.get(it.unidadeDestinoId || po.unidadeId)?.nome || 'Ateliê',
            status: po.itemStatuses?.[it.produtoId] || po.status
          });
        });
      });

    return rows;
  }, [orders, productionOrders, selectedDay, prodMap, unitMap]);

  // 3. Produção por Produto
  const productionByProductRows = useMemo(() => {
    const map = new Map<string, { sku: string; descricao: string; unidade: string; qtdPedidos: number; qtdManual: number; total: number }>();

    orders
      .filter(o => o.status !== 'CANCELADO' && o.dataHoraEntrega.slice(0, 10) >= startDate && o.dataHoraEntrega.slice(0, 10) <= endDate)
      .forEach(o => {
        o.itens.forEach(it => {
          const p = prodMap.get(it.produtoId);
          if (!p) return;
          const cur = map.get(p.id) || { sku: p.sku, descricao: p.descricao, unidade: p.unidade, qtdPedidos: 0, qtdManual: 0, total: 0 };
          cur.qtdPedidos += it.quantidade;
          cur.total += it.quantidade;
          map.set(p.id, cur);
        });
      });

    productionOrders
      .filter(po => po.codigoOrdem.startsWith('OP-MANUAL-') && po.dataProducao >= startDate && po.dataProducao <= endDate)
      .forEach(po => {
        po.itens.forEach(it => {
          const p = prodMap.get(it.produtoId);
          if (!p) return;
          const cur = map.get(p.id) || { sku: p.sku, descricao: p.descricao, unidade: p.unidade, qtdPedidos: 0, qtdManual: 0, total: 0 };
          cur.qtdManual += it.quantidadePlanejada;
          cur.total += it.quantidadePlanejada;
          map.set(p.id, cur);
        });
      });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [orders, productionOrders, startDate, endDate, prodMap]);

  // 4. Contagem de Estoque
  const stockCountRows = useMemo(() => {
    return stock.map(s => {
      const p = prodMap.get(s.produtoId);
      const u = unitMap.get(s.unidadeId);
      const valorTotal = (p?.precoUnitario || 0) * s.quantidadeAtual;
      return {
        loja: u?.nome || s.unidadeId,
        sku: p?.sku || '-',
        produto: p?.descricao || s.produtoId,
        unidade: p?.unidade || 'UN',
        atual: s.quantidadeAtual,
        minima: s.quantidadeMinima,
        status: s.quantidadeAtual <= s.quantidadeMinima ? 'CRÍTICO' : 'OK',
        valorTotal
      };
    });
  }, [stock, prodMap, unitMap]);

  // 5. Resumo da Movimentação de Estoque
  const filteredMovements = useMemo(() => {
    return stockMovements.filter(m => {
      const d = m.dataMovimentacao.slice(0, 10);
      return d >= startDate && d <= endDate;
    });
  }, [stockMovements, startDate, endDate]);

  // 6. Pedidos por Período
  const ordersInPeriod = useMemo(() => {
    return orders
      .filter(o => {
        const d = o.dataHoraEntrega.slice(0, 10);
        return d >= startDate && d <= endDate;
      })
      .sort((a, b) => b.dataHoraEntrega.localeCompare(a.dataHoraEntrega));
  }, [orders, startDate, endDate]);

  // 7. Pedidos por Cliente
  const ordersByCustomerRows = useMemo(() => {
    const map = new Map<string, { nome: string; telefone: string; totalPedidos: number; pendentes: number; entregues: number; valorTotal: number; ultimoPedido: string }>();
    ordersInPeriod.forEach(o => {
      const key = (o.clienteTelefone || o.clienteNome).trim().toLowerCase();
      const cur = map.get(key) || {
        nome: o.clienteNome,
        telefone: o.clienteTelefone,
        totalPedidos: 0,
        pendentes: 0,
        entregues: 0,
        valorTotal: 0,
        ultimoPedido: o.dataHoraEntrega
      };
      cur.totalPedidos += 1;
      if (o.status === 'ENTREGUE') cur.entregues += 1;
      else if (o.status !== 'CANCELADO') cur.pendentes += 1;
      if (o.status !== 'CANCELADO') cur.valorTotal += o.valorTotal;
      if (o.dataHoraEntrega > cur.ultimoPedido) cur.ultimoPedido = o.dataHoraEntrega;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.valorTotal - a.valorTotal);
  }, [ordersInPeriod]);

  // 8. Faturamento por Loja / Forma de Pagamento
  const revenueByStoreRows = useMemo(() => {
    const map = new Map<string, { loja: string; pedidos: number; total: number }>();
    ordersInPeriod
      .filter(o => o.status !== 'CANCELADO')
      .forEach(o => {
        const loja = unitMap.get(o.unidadeOrigemId)?.nome || o.unidadeOrigemId;
        const cur = map.get(o.unidadeOrigemId) || { loja, pedidos: 0, total: 0 };
        cur.pedidos += 1;
        cur.total += o.valorTotal;
        map.set(o.unidadeOrigemId, cur);
      });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [ordersInPeriod, unitMap]);

  const revenueByPaymentRows = useMemo(() => {
    const map = new Map<string, { loja: string; pedidos: number; total: number }>();
    ordersInPeriod
      .filter(o => o.status !== 'CANCELADO')
      .forEach(o => {
        const pag = o.formaPagamento.toUpperCase();
        const cur = map.get(pag) || { loja: pag, pedidos: 0, total: 0 };
        cur.pedidos += 1;
        cur.total += o.valorTotal;
        map.set(pag, cur);
      });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [ordersInPeriod]);

  const handleExportExcel = () => {
    let rows: any[] = [];
    if (activeReport === 'planejamento_entrega') {
      rows = deliveryPlanRows.map(o => ({
        Pedido: o.numeroPedido,
        Horário: new Date(o.dataHoraEntrega).toLocaleString('pt-BR'),
        Cliente: o.clienteNome,
        Telefone: o.clienteTelefone,
        Modalidade: o.tipoEntrega,
        Endereço: o.enderecoEntrega || '',
        'Detalhe Entrega': o.detalheEntrega || '',
        Loja: unitMap.get(o.unidadeOrigemId)?.nome || '',
        Status: o.status
      }));
    } else if (activeReport === 'planejamento_producao') {
      rows = productionPlanRows;
    } else if (activeReport === 'producao_produto') {
      rows = productionByProductRows;
    } else if (activeReport === 'contagem_estoque') {
      rows = stockCountRows;
    } else if (activeReport === 'movimentacao_estoque') {
      rows = filteredMovements.map(m => ({
        Data: new Date(m.dataMovimentacao).toLocaleString('pt-BR'),
        Loja: unitMap.get(m.unidadeId)?.nome || m.unidadeId,
        Produto: prodMap.get(m.produtoId)?.descricao || m.produtoId,
        Tipo: m.tipo,
        Quantidade: m.quantidade,
        Motivo: m.motivo || '',
        Referência: m.referenciaId || ''
      }));
    } else if (activeReport === 'pedidos_periodo') {
      rows = ordersInPeriod.map(o => ({
        Pedido: o.numeroPedido,
        Data: new Date(o.dataHoraEntrega).toLocaleString('pt-BR'),
        Cliente: o.clienteNome,
        Loja: unitMap.get(o.unidadeOrigemId)?.nome || '',
        Total: o.valorTotal,
        Pagamento: o.formaPagamento,
        Status: o.status
      }));
    } else if (activeReport === 'pedidos_cliente') {
      rows = ordersByCustomerRows;
    } else {
      rows = revenueByStoreRows;
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatorio');
    XLSX.writeFile(wb, `Beju_Caramelos_Relatorio_${activeReport}_${today}.xlsx`);
  };

  const usesSingleDay = activeReport === 'planejamento_entrega' || activeReport === 'planejamento_producao';

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8f9ff] overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-[#e2e8f0] px-6 py-4 space-y-3 print:hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#0f172a] font-sans flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-brand-600" />
              <span>Relatórios</span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {usesSingleDay ? (
              <div className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <span className="font-semibold text-slate-600">Dia:</span>
                <input
                  type="date"
                  value={selectedDay}
                  onChange={e => setSelectedDay(e.target.value)}
                  className="bg-transparent font-mono text-xs focus:outline-none"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <span className="font-semibold text-slate-600">De:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="bg-transparent font-mono text-xs focus:outline-none"
                />
                <span className="font-semibold text-slate-600">Até:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="bg-transparent font-mono text-xs focus:outline-none"
                />
              </div>
            )}

            <div className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              <span className="font-semibold text-slate-600">Agrupar:</span>
              <select
                value={groupBy}
                onChange={e => setGroupBy(e.target.value)}
                aria-label="Agrupar relatório por"
                className="bg-transparent font-semibold text-xs text-slate-800 focus:outline-none"
              >
                {GROUP_OPTIONS[activeReport].map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-lg"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel (.xlsx)</span>
            </button>
            <div className="flex items-center gap-1.5 bg-brand-50/90 border border-brand-200 rounded-lg px-2.5 py-1.5 shadow-2xs ring-1 ring-brand-500/10">
              <BarChart3 className="w-3.5 h-3.5 text-brand-600 shrink-0" />
              <span className="text-xs font-semibold text-brand-700">Relatório:</span>
              <select
                value={activeReport}
                onChange={(e) => {
                  const nextTab = e.target.value as ReportTab;
                  setActiveReport(nextTab);
                  setGroupBy(GROUP_OPTIONS[nextTab][0].value);
                }}
                aria-label="Selecionar relatório"
                className="bg-transparent text-xs font-bold text-brand-950 focus:outline-none cursor-pointer pr-1"
              >
                {tabs.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => window.print()}
              title="Imprimir"
              aria-label="Imprimir"
              className="flex items-center justify-center p-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="flex-1 overflow-auto p-6">
        <div id="print-report-area" className="bg-white border border-[#e2e8f0] rounded-xl shadow-xs overflow-hidden p-5">
          <PrintReportHeader
            title={tabs.find(t => t.id === activeReport)?.label || 'Relatório'}
            badge="Relatório Gerencial"
            subtitle={
              usesSingleDay
                ? `Ref.: ${selectedDay.split('-').reverse().join('/')}`
                : `Período: ${startDate.split('-').reverse().join('/')} a ${endDate.split('-').reverse().join('/')}`
            }
          />

          {activeReport === 'planejamento_entrega' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#f8f9ff] border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Pedido</th>
                  <th className="py-2.5 px-3">Hora</th>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3">Modalidade / Endereço</th>
                  <th className="py-2.5 px-3">Detalhe da Entrega</th>
                  <th className="py-2.5 px-3">Loja</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveryPlanRows.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-slate-400">Nenhuma entrega programada para este dia.</td></tr>
                ) : groupItems(deliveryPlanRows, groupBy !== 'NENHUM', o =>
                    groupBy === 'LOJA'
                      ? unitMap.get(o.unidadeOrigemId)?.nome || 'Sem Loja'
                      : groupBy === 'MODALIDADE'
                      ? o.tipoEntrega === 'RETIRADA' ? 'Retirada' : 'Delivery'
                      : o.status
                  ).map(g =>
                    renderGroupBlock(g, 7, `${g.label} (${g.items.length})`, o => (
                        <tr key={o.id}>
                          <td className="py-2.5 px-3 font-mono font-bold">{o.numeroPedido}</td>
                          <td className="py-2.5 px-3 font-mono">{new Date(o.dataHoraEntrega).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="py-2.5 px-3 font-semibold">{o.clienteNome}</td>
                          <td className="py-2.5 px-3 text-slate-600">{o.tipoEntrega === 'RETIRADA' ? 'Retirada' : o.enderecoEntrega}</td>
                          <td className="py-2.5 px-3 text-amber-800">{o.detalheEntrega || '-'}</td>
                          <td className="py-2.5 px-3">{unitMap.get(o.unidadeOrigemId)?.nome || '-'}</td>
                          <td className="py-2.5 px-3 font-semibold">{o.status}</td>
                        </tr>
                    ))
                  )}
              </tbody>
            </table>
          )}

          {activeReport === 'planejamento_producao' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#f8f9ff] border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Turno</th>
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Produto</th>
                  <th className="py-2.5 px-3 text-center">Quantidade</th>
                  <th className="py-2.5 px-3">Destino</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productionPlanRows.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-slate-400">Nenhuma produção planejada para este dia.</td></tr>
                ) : groupItems(
                    productionPlanRows,
                    groupBy !== 'NENHUM',
                    r => (groupBy === 'TURNO' ? r.turno : groupBy === 'DESTINO' ? r.destino : r.status),
                    groupBy === 'TURNO' ? (a, b) => (SHIFT_ORDER[a] || 99) - (SHIFT_ORDER[b] || 99) : undefined
                  ).map(g =>
                    renderGroupBlock(
                      g,
                      6,
                      `${g.label} (${g.items.length} itens • Total: ${g.items.reduce((s, r) => s + r.quantidade, 0)})`,
                      (r, i) => (
                        <tr key={i}>
                          <td className="py-2.5 px-3 font-mono font-bold">{r.turno}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">{r.sku}</td>
                          <td className="py-2.5 px-3 font-semibold">{r.produto}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold">{r.quantidade} {r.unidadeMedida}</td>
                          <td className="py-2.5 px-3">{r.destino}</td>
                          <td className="py-2.5 px-3">{r.status}</td>
                        </tr>
                      )
                    )
                  )}
              </tbody>
            </table>
          )}

          {activeReport === 'producao_produto' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#f8f9ff] border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Produto</th>
                  <th className="py-2.5 px-3 text-center">Qtd. Pedidos</th>
                  <th className="py-2.5 px-3 text-center">Qtd. Manual/Antecipada</th>
                  <th className="py-2.5 px-3 text-center">Total Produzido/Planejado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupItems(productionByProductRows, groupBy !== 'NENHUM', r => `Unidade: ${r.unidade}`).map(g =>
                  renderGroupBlock(
                    g,
                    5,
                    `${g.label} (${g.items.length} produtos • Total: ${g.items.reduce((s, r) => s + r.total, 0)})`,
                    (r, i) => (
                      <tr key={i}>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{r.sku}</td>
                        <td className="py-2.5 px-3 font-semibold">{r.descricao}</td>
                        <td className="py-2.5 px-3 text-center font-mono">{r.qtdPedidos} {r.unidade}</td>
                        <td className="py-2.5 px-3 text-center font-mono">{r.qtdManual} {r.unidade}</td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-brand-700">{r.total} {r.unidade}</td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          )}

          {activeReport === 'contagem_estoque' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#f8f9ff] border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Loja</th>
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Produto</th>
                  <th className="py-2.5 px-3 text-center">Qtd. Atual</th>
                  <th className="py-2.5 px-3 text-center">Qtd. Mínima</th>
                  <th className="py-2.5 px-3 text-right">Valor Estimado</th>
                  <th className="py-2.5 px-3 text-center">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupItems(
                  stockCountRows,
                  groupBy !== 'NENHUM',
                  r => (groupBy === 'LOJA' ? r.loja : r.status),
                  groupBy === 'SITUACAO' ? (a, b) => (a === 'CRÍTICO' ? -1 : b === 'CRÍTICO' ? 1 : a.localeCompare(b)) : undefined
                ).map(g =>
                  renderGroupBlock(
                    g,
                    7,
                    `${g.label} (${g.items.length} itens • Valor: R$ ${g.items.reduce((s, r) => s + r.valorTotal, 0).toFixed(2)})`,
                    (r, i) => (
                      <tr key={i}>
                        <td className="py-2.5 px-3 font-semibold">{r.loja}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{r.sku}</td>
                        <td className="py-2.5 px-3">{r.produto}</td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold">{r.atual} {r.unidade}</td>
                        <td className="py-2.5 px-3 text-center font-mono text-slate-500">{r.minima}</td>
                        <td className="py-2.5 px-3 text-right font-mono">R$ {r.valorTotal.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.status === 'CRÍTICO' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>{r.status}</span>
                        </td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          )}

          {activeReport === 'movimentacao_estoque' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#f8f9ff] border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Data/Hora</th>
                  <th className="py-2.5 px-3">Loja</th>
                  <th className="py-2.5 px-3">Produto</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3 text-center">Quantidade</th>
                  <th className="py-2.5 px-3">Motivo / Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMovements.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-slate-400">Nenhuma movimentação registrada no período.</td></tr>
                ) : groupItems(filteredMovements, groupBy !== 'NENHUM', m =>
                    groupBy === 'LOJA'
                      ? unitMap.get(m.unidadeId)?.nome || m.unidadeId
                      : groupBy === 'DIA'
                      ? new Date(m.dataMovimentacao).toLocaleDateString('pt-BR')
                      : m.tipo,
                    groupBy === 'DIA'
                      ? (a, b) => {
                          const [da, ma, ya] = a.split('/');
                          const [db, mb, yb] = b.split('/');
                          return `${ya}${ma}${da}`.localeCompare(`${yb}${mb}${db}`);
                        }
                      : undefined
                  ).map(g =>
                    renderGroupBlock(
                      g,
                      6,
                      `${g.label} (${g.items.length} movimentações • Qtd: ${g.items.reduce((s, m) => s + m.quantidade, 0)})`,
                      m => (
                        <tr key={m.id}>
                          <td className="py-2.5 px-3 font-mono">{new Date(m.dataMovimentacao).toLocaleString('pt-BR')}</td>
                          <td className="py-2.5 px-3 font-semibold">{unitMap.get(m.unidadeId)?.nome || m.unidadeId}</td>
                          <td className="py-2.5 px-3">{prodMap.get(m.produtoId)?.descricao || m.produtoId}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              m.tipo === 'ENTRADA' ? 'bg-emerald-100 text-emerald-800' : m.tipo === 'SAIDA' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                            }`}>{m.tipo}</span>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold">{m.quantidade}</td>
                          <td className="py-2.5 px-3 text-slate-600">{m.motivo || '-'}</td>
                        </tr>
                      )
                    )
                  )}
              </tbody>
            </table>
          )}

          {activeReport === 'pedidos_periodo' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#f8f9ff] border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Nº Pedido</th>
                  <th className="py-2.5 px-3">Data/Hora</th>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3">Loja</th>
                  <th className="py-2.5 px-3">Pagamento</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupItems(ordersInPeriod, groupBy !== 'NENHUM', o =>
                  groupBy === 'LOJA'
                    ? unitMap.get(o.unidadeOrigemId)?.nome || '-'
                    : groupBy === 'PAGAMENTO'
                    ? o.formaPagamento.toUpperCase()
                    : groupBy === 'DIA'
                    ? new Date(o.dataHoraEntrega).toLocaleDateString('pt-BR')
                    : o.status,
                  groupBy === 'DIA'
                    ? (a, b) => {
                        const [da, ma, ya] = a.split('/');
                        const [db, mb, yb] = b.split('/');
                        return `${ya}${ma}${da}`.localeCompare(`${yb}${mb}${db}`);
                      }
                    : undefined
                ).map(g =>
                  renderGroupBlock(
                    g,
                    7,
                    `${g.label} (${g.items.length} pedidos • Total: R$ ${g.items.reduce((s, o) => s + o.valorTotal, 0).toFixed(2)})`,
                    o => (
                      <tr key={o.id}>
                        <td className="py-2.5 px-3 font-mono font-bold">{o.numeroPedido}</td>
                        <td className="py-2.5 px-3 font-mono">{new Date(o.dataHoraEntrega).toLocaleString('pt-BR')}</td>
                        <td className="py-2.5 px-3 font-semibold">{o.clienteNome}</td>
                        <td className="py-2.5 px-3">{unitMap.get(o.unidadeOrigemId)?.nome || '-'}</td>
                        <td className="py-2.5 px-3 uppercase font-mono">{o.formaPagamento}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">R$ {o.valorTotal.toFixed(2)}</td>
                        <td className="py-2.5 px-3">{o.status}</td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          )}

          {activeReport === 'pedidos_cliente' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#f8f9ff] border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3">Telefone</th>
                  <th className="py-2.5 px-3 text-center">Total Pedidos</th>
                  <th className="py-2.5 px-3 text-center">Pendentes</th>
                  <th className="py-2.5 px-3 text-center">Entregues</th>
                  <th className="py-2.5 px-3 text-right">Valor Acumulado</th>
                  <th className="py-2.5 px-3">Último Pedido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupItems(ordersByCustomerRows, groupBy !== 'NENHUM', r =>
                  r.pendentes > 0 ? 'Com Pedidos Pendentes' : 'Sem Pendências'
                ).map(g =>
                  renderGroupBlock(
                    g,
                    7,
                    `${g.label} (${g.items.length} clientes • Acumulado: R$ ${g.items.reduce((s, r) => s + r.valorTotal, 0).toFixed(2)})`,
                    (r, i) => (
                      <tr key={i}>
                        <td className="py-2.5 px-3 font-semibold">{r.nome}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">{r.telefone}</td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold">{r.totalPedidos}</td>
                        <td className="py-2.5 px-3 text-center font-mono text-amber-700">{r.pendentes}</td>
                        <td className="py-2.5 px-3 text-center font-mono text-emerald-700">{r.entregues}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">R$ {r.valorTotal.toFixed(2)}</td>
                        <td className="py-2.5 px-3 font-mono">{new Date(r.ultimoPedido).toLocaleDateString('pt-BR')}</td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          )}

          {activeReport === 'faturamento_loja' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#f8f9ff] border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">{groupBy === 'PAGAMENTO' ? 'Forma de Pagamento' : 'Loja / Unidade'}</th>
                  <th className="py-2.5 px-3 text-center">Qtd. Pedidos</th>
                  <th className="py-2.5 px-3 text-right">Faturamento Total</th>
                  <th className="py-2.5 px-3 text-right">Ticket Médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(groupBy === 'PAGAMENTO' ? revenueByPaymentRows : revenueByStoreRows).map((r, i) => (
                  <tr key={i}>
                    <td className="py-2.5 px-3 font-semibold">{r.loja}</td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold">{r.pedidos}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">R$ {r.total.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right font-mono">R$ {(r.pedidos ? r.total / r.pedidos : 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
